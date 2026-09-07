import type { DatabaseClient } from '@/shared/database/client'
import { SessionRepository } from '@/modules/session/repo/session.repository'

export interface LogoutAllDeps {
  sql: DatabaseClient
}

/** В отличие от Logout, здесь не нужен конкретный refresh-token — рвём все активные сессии владельца. */
export const LogoutAllUseCase = ({ sql }: LogoutAllDeps) =>
  async (userId: string): Promise<void> => {
    const sessionRepository = SessionRepository(sql)
    await sessionRepository.revokeAllByUserId(userId, 'logout_all')
  }

export type LogoutAll = ReturnType<typeof LogoutAllUseCase>
