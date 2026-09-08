import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { createPostgresUserProfileRepository } from '@/modules/user-profile/repo/postgres-user-profile.repository'
import type { DatabaseClient } from '@/shared/database/client'
import type { InboxRepository } from '@/modules/integration-events/incoming/repo/inbox.repository'
import { createPostgresInboxRepository } from '@/modules/integration-events/incoming/repo/postgres-inbox.repository'

/** Репозитории, привязанные к одной DB-транзакции user-service. */
export interface UserTransactionRepositories {
  userProfiles: UserProfileRepository
  inbox: InboxRepository
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
    userProfiles: createPostgresUserProfileRepository(transaction),
    inbox: createPostgresInboxRepository(transaction),
  })),
})
