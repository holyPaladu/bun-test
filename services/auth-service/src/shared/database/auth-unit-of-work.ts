import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { createPostgresAuthRepository } from '@/modules/auth/repo/postgres-auth.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import { createPostgresOutboxRepository } from '@/modules/integration-events/outgoing/repo/postgres-outbox.repository'
import type { OutboxAppendRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import type { DatabaseClient } from '@/shared/database/client'

/** Репозитории, привязанные к одной DB-транзакции auth-service. */
export interface AuthTransactionRepositories {
  authAccounts: AuthRepository
  refreshTokens: RefreshTokenRepository
  sessions: SessionRepository
  outboxEvents: OutboxAppendRepository
}

/** Application port: use cases не знают ни про Bun SQL, ни про repo factories. */
export interface AuthUnitOfWork {
  run<TResult>(
    work: (repositories: AuthTransactionRepositories) => Promise<TResult>,
  ): Promise<TResult>
}

/** PostgreSQL-сборка транзакционных репозиториев auth-service. */
export const createAuthUnitOfWork = (sql: DatabaseClient): AuthUnitOfWork => ({
  run: work => sql.begin(transaction => work({
    authAccounts: createPostgresAuthRepository(transaction),
    refreshTokens: RefreshTokenRepository(transaction),
    sessions: SessionRepository(transaction),
    outboxEvents: createPostgresOutboxRepository(transaction),
  })),
})
