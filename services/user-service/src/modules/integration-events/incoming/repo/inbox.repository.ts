import type { DatabaseClient } from '@/shared/database/client'
import type { IncomingIntegrationEvent } from '../handler-registry'

/** SQL-adapter for the event inbox. */
export const createInboxRepository = (sql: DatabaseClient) => ({
  /** true — eventId зарезервирован этой транзакцией; false — это повтор. */
  reserve: async (event: IncomingIntegrationEvent): Promise<boolean> => {
    const [row] = await sql<{ event_id: string }[]>`
      INSERT INTO event_inbox (event_id, event_type, occurred_at)
      VALUES (${event.eventId}, ${event.type}, ${new Date(event.occurredAt)})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    return Boolean(row)
  },
})
