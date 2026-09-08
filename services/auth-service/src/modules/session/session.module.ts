import type { Container } from '@/container'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import { GetSessionsUseCase } from '@/modules/session/use-cases/get-sessions'
import { IssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { LogoutAllUseCase } from '@/modules/session/use-cases/logout-all'
import { LogoutUseCase } from '@/modules/session/use-cases/logout'
import { RevokeSessionByUserIdUseCase } from '@/modules/session/use-cases/revoke-session-by-user-id'
import { RotateTokensUseCase } from '@/modules/session/use-cases/rotate-tokens'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'

/** Собирает session repository и use cases из общей runtime-инфраструктуры. */
export const createSessionModule = (
  container: Pick<Container, 'sql' | 'jwtSigner' | 'unitOfWork' | 'env'>,
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
      sessionAbsoluteTtlDays: container.env.SESSION_ABSOLUTE_TTL_DAYS,
    }),
    rotateTokens: RotateTokensUseCase({
      unitOfWork: container.unitOfWork,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
    logout: LogoutUseCase({
      unitOfWork: container.unitOfWork,
      refreshTokenGenerator,
    }),
    logoutAll: LogoutAllUseCase({
      sessionRepository,
    }),
    getSessions: GetSessionsUseCase({
      sessionRepo: sessionRepository,
    }),
    revokeSessionByUserId: RevokeSessionByUserIdUseCase({
      sessionRepo: sessionRepository,
    }),
  }
}

export type SessionModule = ReturnType<typeof createSessionModule>
