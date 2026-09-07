import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import { OutboxRepository } from '@/modules/integration-events/outbox.repository'
import type { DatabaseClient } from '@/shared/database/client'

/** Репозитории, привязанные к одной DB-транзакции auth-service. */
export interface AuthTransactionRepositories {
  authAccounts: AuthRepository
  refreshTokens: RefreshTokenRepository
  sessions: SessionRepository
  outboxEvents: OutboxRepository
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
    authAccounts: AuthRepository(transaction),
    refreshTokens: RefreshTokenRepository(transaction),
    sessions: SessionRepository(transaction),
    outboxEvents: OutboxRepository(transaction),
  })),
})
