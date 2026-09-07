import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import { NotFoundError, UnauthorizedError } from '@/shared/errors/app-error'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'

export interface LogoutUseCaseDeps {
  unitOfWork: AuthUnitOfWork
  refreshTokenGenerator: RefreshTokenGenerator
}

/** Логаут завершает всю сессию (устройство), а не только предъявленный токен. */
export const LogoutUseCase = (deps: LogoutUseCaseDeps) =>
  async (refreshToken: string): Promise<void> => {
    await deps.unitOfWork.run(async repositories => {
      const tokenHash = deps.refreshTokenGenerator.hash(refreshToken)

      const storedToken = await repositories.refreshTokens.findByTokenHash(tokenHash)
      if (!storedToken) throw new NotFoundError('Refresh token')

      const session = await repositories.sessions.findById(storedToken.sessionId)
      if (!session || session.revokedAt) throw new UnauthorizedError('Refresh token has been revoked')
      if (session.absoluteExpiresAt <= new Date()) throw new UnauthorizedError('Session has expired')
      if (storedToken.expiresAt < new Date()) throw new UnauthorizedError('Refresh token has expired')

      await repositories.sessions.revoke(session.id, 'logout')
    })
  }

export type Logout = ReturnType<typeof LogoutUseCase>
