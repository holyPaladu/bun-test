import type { ClaimedOutboxEvent } from '../entities/outbox.entity'
import type { OutgoingIntegrationEvent } from '../types/integration-event.type'

export interface OutboxEventRow {
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

export const toClaimedOutboxEvent = (row: OutboxEventRow): ClaimedOutboxEvent => ({
  eventId: row.id,
  event: deserializeEvent(row.payload),
  occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
  attemptCount: row.attempt_count,
  leaseOwner: row.lease_owner,
})
