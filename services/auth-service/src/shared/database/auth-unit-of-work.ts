import { createAuthRepository } from '@/modules/auth/repo/auth.repository'
import { createRefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { createSessionRepository } from '@/modules/session/repo/session.repository'
import { createOutboxRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import type { OutgoingIntegrationEvent } from '@/modules/integration-events/outgoing/types/integration-event.type'
import type { DatabaseClient } from '@/shared/database/client'

interface AppendOutboxEventPort {
  append(event: OutgoingIntegrationEvent, aggregateId: string): Promise<void>
}

/** Репозитории, привязанные к одной DB-транзакции auth-service. */
export interface AuthTransactionRepositories {
  authAccounts: ReturnType<typeof createAuthRepository>
  refreshTokens: ReturnType<typeof createRefreshTokenRepository>
  sessions: ReturnType<typeof createSessionRepository>
  outboxEvents: AppendOutboxEventPort
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
    authAccounts: createAuthRepository(transaction),
    refreshTokens: createRefreshTokenRepository(transaction),
    sessions: createSessionRepository(transaction),
    outboxEvents: createOutboxRepository(transaction),
  })),
})
