import { createUserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import type { DatabaseClient } from '@/shared/database/client'
import { createInboxRepository } from '@/modules/integration-events/incoming/repo/inbox.repository'

/** Репозитории, привязанные к одной DB-транзакции user-service. */
export interface UserTransactionRepositories {
  userProfiles: ReturnType<typeof createUserProfileRepository>
  inbox: ReturnType<typeof createInboxRepository>
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
    userProfiles: createUserProfileRepository(transaction),
    inbox: createInboxRepository(transaction),
  })),
})
