import type { Pagination, PaginationInside } from '@/shared/types/meta.type'
import type { Session } from '../entities/session.entity'
import type { PaginatedResult } from '@/shared/types/result.type'

export interface GetSessionsDeps {
  sessions: {
    findAllByUserId(
      userId: string,
      pagination: PaginationInside,
    ): Promise<PaginatedResult<Session>>
  }
}

export const createGetSessionsUseCase = ({ sessions }: GetSessionsDeps) =>
  async (userId: string, pagination: Pagination): Promise<PaginatedResult<Session>> =>
    sessions.findAllByUserId(userId, {
      limit: pagination.perPage,
      offset: (pagination.page - 1) * pagination.perPage,
    })

export type GetSessions = ReturnType<typeof createGetSessionsUseCase>
