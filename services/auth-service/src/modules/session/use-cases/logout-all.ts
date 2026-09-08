import type { SessionRepository } from '@/modules/session/repo/session.repository'

export interface LogoutAllDeps {
  sessionRepository: Pick<SessionRepository, 'revokeAllByUserId'>
}

/** В отличие от Logout, здесь не нужен конкретный refresh-token — рвём все активные сессии владельца. */
export const LogoutAllUseCase = ({ sessionRepository }: LogoutAllDeps) =>
  async (userId: string): Promise<void> => {
    await sessionRepository.revokeAllByUserId(userId, 'logout_all')
  }

export type LogoutAll = ReturnType<typeof LogoutAllUseCase>
