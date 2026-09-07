import type { Container } from '@/container'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { IssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { RotateTokensUseCase } from '@/modules/session/use-cases/rotate-tokens'
import { LogoutUseCase } from '@/modules/session/use-cases/logout'
import { LogoutAllUseCase } from '@/modules/session/use-cases/logout-all'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { GetSessionsUseCase } from './use-cases/get-sessions'

/**
 * Весь процесс access/refresh — выпуск, ротация, логаут — живёт здесь одним куском.
 * authRepository приходит извне (владеет им modules/auth): session-модулю он нужен
 * только для read-only проверки статуса пользователя при ротации.
 */
export const SessionModule = (
  container: Pick<Container, 'sql' | 'jwtSigner' | 'env'> & { authRepository: AuthRepository },
) => {
  const sessionRepository = SessionRepository(container.sql)
  const refreshTokenRepository = RefreshTokenRepository(container.sql)

  return {
    issueTokens: IssueTokensUseCase({
      sessionRepository,
      refreshTokenRepository,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
    rotateTokens: RotateTokensUseCase({
      sql: container.sql,
      authRepository: container.authRepository,
      sessionRepository,
      refreshTokenRepository,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
    logout: LogoutUseCase({
      sql: container.sql,
      refreshTokenGenerator,
    }),
    logoutAll: LogoutAllUseCase({
      sql: container.sql,
    }),
    getSessions: GetSessionsUseCase({
      sessionRepo: sessionRepository
    })
  }
}

export type SessionModule = ReturnType<typeof SessionModule>
