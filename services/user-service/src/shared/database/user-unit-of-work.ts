import { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import type { DatabaseClient } from '@/shared/database/client'

/** Репозитории, привязанные к одной DB-транзакции user-service. */
export interface UserTransactionRepositories {
  userProfiles: UserProfileRepository
}

/** Application port: use cases не знают ни про Bun SQL, ни про repo factories. */
export interface UserUnitOfWork {
  run<TResult>(
    work: (repositories: UserTransactionRepositories) => Promise<TResult>,
  ): Promise<TResult>
}

/** PostgreSQL-сборка транзакционных репозиториев user-service. */
export const createUserUnitOfWork = (sql: DatabaseClient): UserUnitOfWork => ({
  run: work => sql.begin(transaction => work({
    userProfiles: UserProfileRepository(transaction),
  })),
})
