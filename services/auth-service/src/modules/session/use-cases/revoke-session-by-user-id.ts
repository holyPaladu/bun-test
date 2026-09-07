import { NotFoundError } from "elysia"
import { SessionRevokedReason } from "../entities/session.entity"
import { SessionRepository } from "../repo/session.repository"


export interface RevokeSessionByUserIdDeps {
  sessionRepo: SessionRepository
}

export const RevokeSessionByUserIdUseCase = ({ sessionRepo }: RevokeSessionByUserIdDeps) => 
  async (sessionId: string, userId: string, reason: SessionRevokedReason) => {
    const deleted = await sessionRepo.revokeSessionByUserId(sessionId, userId, reason)
    if (!deleted) throw new NotFoundError("Session")
  }

export type RevokeSessionByUserId = ReturnType<typeof RevokeSessionByUserIdUseCase>