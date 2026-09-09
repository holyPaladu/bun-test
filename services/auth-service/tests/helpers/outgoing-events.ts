import { createAccountCreatedEvent } from '@/modules/auth/events/create-account-created.event'
import type { ClaimedOutboxEvent } from '@/modules/integration-events/outgoing/entities/outbox.entity'
import type { Logger } from '@/shared/lib/logger/logger'

export const event = createAccountCreatedEvent('550e8400-e29b-41d4-a716-446655440000')

export const claimedEvent = (attemptCount = 1): ClaimedOutboxEvent => ({
  eventId: event.eventId,
  event,
  occurredAt: new Date(event.occurredAt),
  attemptCount,
  leaseOwner: 'publisher-a',
})

export const silentLogger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
}
