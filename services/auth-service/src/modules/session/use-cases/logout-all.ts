import type { SessionRevokedReason } from '@/modules/session/entities/session.entity'

export interface LogoutAllDeps {
  sessions: {
    revokeAllByUserId(userId: string, reason: SessionRevokedReason): Promise<void>
  }
}

/** В отличие от Logout, здесь не нужен конкретный refresh-token — рвём все активные сессии владельца. */
export const createLogoutAllUseCase = ({ sessions }: LogoutAllDeps) =>
  async (userId: string): Promise<void> => {
    await sessions.revokeAllByUserId(userId, 'logout_all')
  }

export type LogoutAll = ReturnType<typeof createLogoutAllUseCase>
