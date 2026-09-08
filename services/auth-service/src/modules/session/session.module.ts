import type { Container } from '@/container'
import { createRefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { createSessionRepository } from '@/modules/session/repo/session.repository'
import { createGetSessionsUseCase } from '@/modules/session/use-cases/get-sessions'
import { createIssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { createLogoutAllUseCase } from '@/modules/session/use-cases/logout-all'
import { createLogoutUseCase } from '@/modules/session/use-cases/logout'
import { createRevokeSessionByUserIdUseCase } from '@/modules/session/use-cases/revoke-session-by-user-id'
import { createRotateTokensUseCase } from '@/modules/session/use-cases/rotate-tokens'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'

/** Собирает session repository и use cases из общей runtime-инфраструктуры. */
export const createSessionModule = (
  container: Pick<Container, 'sql' | 'jwtSigner' | 'unitOfWork' | 'env'>,
) => {
  const sessions = createSessionRepository(container.sql)
  const refreshTokens = createRefreshTokenRepository(container.sql)

  return {
    issueTokens: createIssueTokensUseCase({
      sessions,
      refreshTokens,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
      sessionAbsoluteTtlDays: container.env.SESSION_ABSOLUTE_TTL_DAYS,
    }),
    rotateTokens: createRotateTokensUseCase({
      unitOfWork: container.unitOfWork,
      jwtSigner: container.jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: container.env.REFRESH_TOKEN_TTL_DAYS,
    }),
    logout: createLogoutUseCase({
      unitOfWork: container.unitOfWork,
      refreshTokenGenerator,
    }),
    logoutAll: createLogoutAllUseCase({
      sessions,
    }),
    getSessions: createGetSessionsUseCase({
      sessions,
    }),
    revokeSessionByUserId: createRevokeSessionByUserIdUseCase({
      sessions,
    }),
  }
}

export type SessionModule = ReturnType<typeof createSessionModule>
