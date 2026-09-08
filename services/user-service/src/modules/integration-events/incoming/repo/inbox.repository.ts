import type { DatabaseClient } from '@/shared/database/client'
import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'

/** SQL-adapter for the event inbox. */
export const createInboxRepository = (sql: DatabaseClient) => ({
  /** true — eventId зарезервирован этой транзакцией; false — это повтор. */
  reserve: async (event: AccountCreatedV1): Promise<boolean> => {
    const [row] = await sql<{ event_id: string }[]>`
      INSERT INTO event_inbox (event_id, event_type, occurred_at)
      VALUES (${event.eventId}, ${event.type}, ${new Date(event.occurredAt)})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    return Boolean(row)
  },
})
