import { Pagination } from "@/shared/types/meta.type";
import { Session } from "../entities/session.entity";
import { SessionRepository } from "../repo/session.repository";
import { PaginatedResult } from "@/shared/types/result.type";

export interface GetSessionsDeps {
  sessionRepo: SessionRepository
}

export const GetSessionsUseCase = ({ sessionRepo }: GetSessionsDeps) =>
  async (userId: string, pagination: Pagination): Promise<PaginatedResult<Session>> => 
    {
      return sessionRepo.findAllByUserId(userId, {
        limit: pagination.perPage,
        offset: (pagination.page -1) * pagination.perPage
      })
    }

export type GetSessions = ReturnType<typeof GetSessionsUseCase>