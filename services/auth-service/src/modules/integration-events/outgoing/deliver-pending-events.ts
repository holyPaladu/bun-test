import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import type { RetryPolicy } from './retry-policy'
import type { DeliveryMetrics } from './metrics/delivery.metrics'
import type { Logger } from '@/shared/lib/logger/logger'
import { createDeliverEvent } from './deliver-event'

export { EventDeliveryError } from './delivery-error'

type OutgoingIntegrationEvent = AccountCreatedV1
type SendEvent = (event: OutgoingIntegrationEvent) => Promise<void>

export interface ClaimedOutboxEvent {
  id: string
  event: OutgoingIntegrationEvent
  occurredAt: Date
  attemptCount: number
  leaseOwner: string
}

export type OutboxDeliveryPort = {
  claimDue(input: {
    limit: number
    leaseMs: number
    leaseOwner: string
  }): Promise<ClaimedOutboxEvent[]>
  markPublished(input: { eventId: string; leaseOwner: string }): Promise<boolean>
  markFailed(input: {
    eventId: string
    leaseOwner: string
    error: string
    nextAttemptAt: Date
  }): Promise<boolean>
  markDeadLettered(input: {
    eventId: string
    leaseOwner: string
    error: string
  }): Promise<boolean>
}

export interface DeliverPendingEventsOptions extends RetryPolicy {
  batchSize: number
  leaseMs: number
  publisherId: string
}

export interface DeliverPendingEventsDeps {
  outbox: OutboxDeliveryPort
  sendEvent: SendEvent
  metrics: DeliveryMetrics
  logger: Logger
  options: DeliverPendingEventsOptions
  now?: () => Date
  random?: () => number
}

export const createDeliverPendingEvents = (deps: DeliverPendingEventsDeps) => {
  const deliverEvent = createDeliverEvent(deps)
  return async function deliverPendingEvents(): Promise<void> {
    const events = await deps.outbox.claimDue({
      limit: deps.options.batchSize,
      leaseMs: deps.options.leaseMs,
      leaseOwner: deps.options.publisherId,
    })
    await Promise.all(events.map(deliverEvent))
  }
}

export type DeliverPendingEvents = ReturnType<typeof createDeliverPendingEvents>
