import type { DatabaseClient } from '@/shared/database/client'
import { NotFoundError, UnauthorizedError } from '@/shared/errors/app-error'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'

export interface LogoutUseCaseDeps {
  sql: DatabaseClient
  refreshTokenGenerator: RefreshTokenGenerator
}

/** Логаут завершает всю сессию (устройство), а не только предъявленный токен. */
export const LogoutUseCase = (deps: LogoutUseCaseDeps) =>
  async (refreshToken: string): Promise<void> => {
    await deps.sql.begin(async (tx) => {
      const tokenRepo = RefreshTokenRepository(tx)
      const sessionRepo = SessionRepository(tx)
      const tokenHash = deps.refreshTokenGenerator.hash(refreshToken)

      const storedToken = await tokenRepo.findByTokenHash(tokenHash)
      if (!storedToken) throw new NotFoundError('Refresh token')

      const session = await sessionRepo.findById(storedToken.sessionId)
      if (!session || session.revokedAt) throw new UnauthorizedError('Refresh token has been revoked')
      if (session.absoluteExpiresAt <= new Date()) throw new UnauthorizedError('Session has expired')
      if (storedToken.expiresAt < new Date()) throw new UnauthorizedError('Refresh token has expired')

      await sessionRepo.revoke(session.id, 'logout')
    })
  }

export type Logout = ReturnType<typeof LogoutUseCase>
