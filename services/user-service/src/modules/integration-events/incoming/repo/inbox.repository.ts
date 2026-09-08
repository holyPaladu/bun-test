import type { DatabaseClient } from '@/shared/database/client'
import type { InboxEntry } from '../entities/inbox.entity'

interface EventIdRow {
  event_id: string
}

export interface InboxRepository {
  reserve(entry: InboxEntry): Promise<boolean>
}

export const createInboxRepository = (sql: DatabaseClient): InboxRepository => ({
  /** true — eventId зарезервирован этой транзакцией; false — это повтор. */
  reserve: async entry => {
    const [row] = await sql<EventIdRow[]>`
      INSERT INTO event_inbox (event_id, event_type, occurred_at)
      VALUES (${entry.eventId}, ${entry.eventType}, ${new Date(entry.occurredAt)})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    return Boolean(row)
  },
})
