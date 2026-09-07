import type { Container } from '@/container'
import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { AuthRoutes } from '@/modules/auth/auth.routes'
import { LoginUserUseCase } from '@/modules/auth/use-cases/login-user'
import { RegisterUserUseCase } from '@/modules/auth/use-cases/register-user'
import { SessionModule } from '@/modules/session'

/**
 * Публичный вход в модуль: собирает репозиторий, use-case'ы и роуты
 * из зависимостей контейнера. app.ts подключает результат через .use()
 * напрямую, без версионной обёртки — см. README.
 *
 * Выпуск/ротация/логаут access и refresh токенов — забота modules/session,
 * сюда приходят готовыми use-case'ами; auth отвечает только за идентичность
 * (регистрация, проверка пароля при логине).
 */
export const AuthModule = (container: Pick<Container, 'sql' | 'passwordHasher' | 'jwtSigner' | 'env'>) => {
  const authRepository = AuthRepository(container.sql)
  const session = SessionModule({ ...container, authRepository })

  const usecase = {
    registerUser: RegisterUserUseCase({
      authRepository,
      passwordHasher: container.passwordHasher,
    }),
    loginUser: LoginUserUseCase({
      authRepository,
      passwordHasher: container.passwordHasher,
      issueTokens: session.issueTokens,
    }),
    refreshToken: session.rotateTokens,
    logout: session.logout,
  }

  return AuthRoutes(usecase)
}
