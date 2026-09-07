import type { IntegrationEvent } from '@/modules/integration-events/events'
import type { DatabaseClient } from '@/shared/database/client'

export interface OutboxEventRow {
  id: string
  event_type: string
  aggregate_id: string
  payload: IntegrationEvent | string
  occurred_at: Date | string
  attempt_count: number
}

export interface ClaimedOutboxEvent {
  id: string
  event: IntegrationEvent
  occurredAt: Date
  attemptCount: number
}

export interface OutboxStats {
  pending: number
  deadLettered: number
  oldestPendingAgeSeconds: number
}

export interface OutboxRepository {
  insert(event: IntegrationEvent, aggregateId: string): Promise<void>
  claimDue(batchSize: number, leaseMs: number): Promise<ClaimedOutboxEvent[]>
  markPublished(eventId: string): Promise<void>
  markFailed(eventId: string, error: string, nextAttemptAt: Date): Promise<void>
  markDeadLettered(eventId: string, error: string): Promise<void>
  stats(): Promise<OutboxStats>
}

const deserializeEvent = (payload: IntegrationEvent | string): IntegrationEvent =>
  typeof payload === 'string' ? JSON.parse(payload) as IntegrationEvent : payload

export const OutboxRepository = (sql: DatabaseClient): OutboxRepository => ({
  insert: async (event, aggregateId) => {
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

  claimDue: async (batchSize, leaseMs) => {
    const rows = await sql<OutboxEventRow[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE published_at IS NULL
          AND dead_lettered_at IS NULL
          AND next_attempt_at <= now()
          AND (locked_until IS NULL OR locked_until <= now())
        ORDER BY next_attempt_at, occurred_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS event
      SET attempt_count = event.attempt_count + 1,
          locked_until = now() + (${leaseMs} * interval '1 millisecond')
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.event_type, event.aggregate_id, event.payload,
                event.occurred_at, event.attempt_count
    `

    return rows.map(row => ({
      id: row.id,
      event: deserializeEvent(row.payload),
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
      attemptCount: row.attempt_count,
    }))
  },

  markPublished: async eventId => {
    await sql`
      UPDATE outbox_events
      SET published_at = now(), locked_until = NULL, last_error = NULL
      WHERE id = ${eventId} AND published_at IS NULL AND dead_lettered_at IS NULL
    `
  },

  markFailed: async (eventId, error, nextAttemptAt) => {
    await sql`
      UPDATE outbox_events
      SET next_attempt_at = ${nextAttemptAt}, locked_until = NULL, last_error = ${error}
      WHERE id = ${eventId} AND published_at IS NULL AND dead_lettered_at IS NULL
    `
  },

  markDeadLettered: async (eventId, error) => {
    await sql`
      UPDATE outbox_events
      SET dead_lettered_at = now(), locked_until = NULL, last_error = ${error}
      WHERE id = ${eventId} AND published_at IS NULL AND dead_lettered_at IS NULL
    `
  },

  stats: async () => {
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
