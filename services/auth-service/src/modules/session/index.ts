import type { Container } from '@/container'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { IssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { RotateTokensUseCase } from '@/modules/session/use-cases/rotate-tokens'
import { LogoutUseCase } from '@/modules/session/use-cases/logout'
import { LogoutAllUseCase } from '@/modules/session/use-cases/logout-all'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { GetSessionsUseCase } from './use-cases/get-sessions'
import { RevokeSessionByUserIdUseCase } from './use-cases/revoke-session-by-user-id'

/**
 * Весь процесс access/refresh — выпуск, ротация, логаут — живёт здесь одним куском.
 * Проверки и изменения при ротации выполняются через репозитории одной транзакции.
 */
export const SessionModule = (container: Pick<Container, 'sql' | 'jwtSigner' | 'env'>) => {
  const sessionRepository = SessionRepository(container.sql)
  const refreshTokenRepository = RefreshTokenRepository(container.sql)

  return {
    issueTokens: IssueTokensUseCase({
      sessionRepository,
      refreshTokenRepository,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
      sessionAbsoluteTtlDays: container.env.SESSION_ABSOLUTE_TTL_DAYS,
    }),
    rotateTokens: RotateTokensUseCase({
      sql: container.sql,
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
    }),
    revokeSessionByUserId: RevokeSessionByUserIdUseCase({
      sessionRepo: sessionRepository
    })
  }
}

export type SessionModule = ReturnType<typeof SessionModule>
