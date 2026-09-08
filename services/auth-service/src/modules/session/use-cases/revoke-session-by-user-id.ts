import type { SessionRevokedReason } from '../entities/session.entity'
import { NotFoundError } from '@/shared/errors/app-error'

export interface RevokeSessionByUserIdDeps {
  sessions: {
    revokeSessionByUserId(
      sessionId: string,
      userId: string,
      reason: SessionRevokedReason,
    ): Promise<boolean>
  }
}

export const createRevokeSessionByUserIdUseCase = ({ sessions }: RevokeSessionByUserIdDeps) =>
  async (sessionId: string, userId: string, reason: SessionRevokedReason) => {
    const deleted = await sessions.revokeSessionByUserId(sessionId, userId, reason)
    if (!deleted) throw new NotFoundError('Session')
  }

export type RevokeSessionByUserId = ReturnType<typeof createRevokeSessionByUserIdUseCase>
