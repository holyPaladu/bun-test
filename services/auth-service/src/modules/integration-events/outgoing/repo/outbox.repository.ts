import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import type { DatabaseClient } from '@/shared/database/client'

export type OutgoingIntegrationEvent = AccountCreatedV1

interface OutboxEventRow {
  id: string
  payload: OutgoingIntegrationEvent | string
  occurred_at: Date | string
  attempt_count: number
  lease_owner: string
}

const deserializeEvent = (
  payload: OutgoingIntegrationEvent | string,
): OutgoingIntegrationEvent => typeof payload === 'string'
  ? JSON.parse(payload) as OutgoingIntegrationEvent
  : payload

/** SQL-adapter for the transactional outbox. */
export const createOutboxRepository = (sql: DatabaseClient) => ({
  append: async (event: OutgoingIntegrationEvent, aggregateId: string): Promise<void> => {
    await sql`
      INSERT INTO outbox_events (id, event_type, aggregate_id, payload, occurred_at)
      VALUES (
        ${event.eventId},
        ${event.type},
        ${aggregateId},
        ${JSON.stringify(event)}::jsonb,
        ${new Date(event.occurredAt)}
      )
    `
  },

  claimDue: async (input: {
    limit: number
    leaseMs: number
    leaseOwner: string
  }) => {
    const rows = await sql<OutboxEventRow[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE published_at IS NULL
          AND dead_lettered_at IS NULL
          AND next_attempt_at <= now()
          AND (locked_until IS NULL OR locked_until <= now())
        ORDER BY next_attempt_at, occurred_at
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS event
      SET attempt_count = event.attempt_count + 1,
          locked_until = now() + (${input.leaseMs} * interval '1 millisecond'),
          lease_owner = ${input.leaseOwner}
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.payload, event.occurred_at,
                event.attempt_count, event.lease_owner
    `

    return rows.map(row => ({
      id: row.id,
      event: deserializeEvent(row.payload),
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
      attemptCount: row.attempt_count,
      leaseOwner: row.lease_owner,
    }))
  },

  markPublished: async (input: { eventId: string; leaseOwner: string }): Promise<boolean> => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE outbox_events
      SET published_at = now(), locked_until = NULL, lease_owner = NULL, last_error = NULL
      WHERE id = ${input.eventId}
        AND lease_owner = ${input.leaseOwner}
        AND locked_until > now()
        AND published_at IS NULL
        AND dead_lettered_at IS NULL
      RETURNING id
    `
    return Boolean(row)
  },

  markFailed: async (input: {
    eventId: string
    leaseOwner: string
    error: string
    nextAttemptAt: Date
  }): Promise<boolean> => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE outbox_events
      SET next_attempt_at = ${input.nextAttemptAt}, locked_until = NULL,
          lease_owner = NULL, last_error = ${input.error}
      WHERE id = ${input.eventId}
        AND lease_owner = ${input.leaseOwner}
        AND locked_until > now()
        AND published_at IS NULL
        AND dead_lettered_at IS NULL
      RETURNING id
    `
    return Boolean(row)
  },

  markDeadLettered: async (input: {
    eventId: string
    leaseOwner: string
    error: string
  }): Promise<boolean> => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE outbox_events
      SET dead_lettered_at = now(), locked_until = NULL,
          lease_owner = NULL, last_error = ${input.error}
      WHERE id = ${input.eventId}
        AND lease_owner = ${input.leaseOwner}
        AND locked_until > now()
        AND published_at IS NULL
        AND dead_lettered_at IS NULL
      RETURNING id
    `
    return Boolean(row)
  },

  /** Manual replay preserves the original event id and payload. */
  replayDeadLettered: async (eventId: string): Promise<boolean> => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE outbox_events
      SET dead_lettered_at = NULL, attempt_count = 0, next_attempt_at = now(),
          locked_until = NULL, lease_owner = NULL, last_error = NULL
      WHERE id = ${eventId} AND dead_lettered_at IS NOT NULL
      RETURNING id
    `
    return Boolean(row)
  },

  getStats: async () => {
    const [row] = await sql<{
      pending: string | number
      dead_lettered: string | number
      oldest_pending_age_seconds: string | number | null
    }[]>`
      SELECT
        count(*) FILTER (
          WHERE published_at IS NULL AND dead_lettered_at IS NULL
        ) AS pending,
        count(*) FILTER (WHERE dead_lettered_at IS NOT NULL) AS dead_lettered,
        COALESCE(extract(epoch FROM now() - min(occurred_at) FILTER (
          WHERE published_at IS NULL AND dead_lettered_at IS NULL
        )), 0) AS oldest_pending_age_seconds
      FROM outbox_events
    `

    return {
      pending: Number(row?.pending ?? 0),
      deadLettered: Number(row?.dead_lettered ?? 0),
      oldestPendingAgeSeconds: Number(row?.oldest_pending_age_seconds ?? 0),
    }
  },
})
