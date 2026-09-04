import type { Container } from '@/container'
import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { AuthRoutes } from '@/modules/auth/auth.routes'
import { RefreshTokenRepository } from '@/modules/auth/repo/refresh-token.repository'
import { LoginUserUseCase } from '@/modules/auth/use-cases/login-user'
import { RegisterUserUseCase } from '@/modules/auth/use-cases/register-user'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { RefreshTokenUseCase } from './use-cases/refresh-token'

/**
 * Публичный вход в модуль: собирает репозиторий, use-case'ы и роуты
 * из зависимостей контейнера. app.ts подключает результат через .use()
 * напрямую, без версионной обёртки — см. README.
 */
export const AuthModule = (container: Pick<Container, 'sql' | 'passwordHasher' | 'jwtSigner' | 'env'>) => {
  const authRepository = AuthRepository(container.sql)
  const refreshTokenRepository = RefreshTokenRepository(container.sql)

  const usecase = {
    registerUser: RegisterUserUseCase({
      authRepository,
      passwordHasher: container.passwordHasher,
    }),
    loginUser: LoginUserUseCase({
      authRepository,
      refreshTokenRepository,
      passwordHasher: container.passwordHasher,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
    refreshToken: RefreshTokenUseCase({
      sql: container.sql,
      authRepository,
      refreshTokenRepository,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
  }

  return AuthRoutes(usecase)
}
