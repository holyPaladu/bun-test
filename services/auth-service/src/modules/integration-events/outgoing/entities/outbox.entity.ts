import type { OutgoingIntegrationEvent } from '../types/integration-event.type'

/** An outbox event reserved for one delivery attempt by a lease owner. */
export interface ClaimedOutboxEvent {
  eventId: string
  event: OutgoingIntegrationEvent
  occurredAt: Date
  attemptCount: number
  leaseOwner: string
}
