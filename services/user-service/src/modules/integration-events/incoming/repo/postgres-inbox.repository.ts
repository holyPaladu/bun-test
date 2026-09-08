import type { DatabaseClient } from '@/shared/database/client'
import type { InboxRepository } from './inbox.repository'

export const createPostgresInboxRepository = (sql: DatabaseClient): InboxRepository => ({
  reserve: async event => {
    const [row] = await sql<{ event_id: string }[]>`
      INSERT INTO event_inbox (event_id, event_type, occurred_at)
      VALUES (${event.eventId}, ${event.type}, ${new Date(event.occurredAt)})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    return Boolean(row)
  },
})
