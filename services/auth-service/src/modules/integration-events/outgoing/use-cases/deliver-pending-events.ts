import type { ClaimedOutboxEvent } from '../entities/outbox.entity'

export interface DeliverPendingEventsDeps {
  outbox: {
    claimDue(input: {
      limit: number
      leaseMs: number
      leaseOwner: string
    }): Promise<ClaimedOutboxEvent[]>
  }
  deliverEvent(event: ClaimedOutboxEvent): Promise<void>
  options: {
    batchSize: number
    leaseMs: number
    publisherId: string
  }
}

/** Claims one batch and waits for its parallel delivery attempts. */
export const createDeliverPendingEventsUseCase = (deps: DeliverPendingEventsDeps) => {
  return async function deliverPendingEvents(): Promise<void> {
    const events = await deps.outbox.claimDue({
      limit: deps.options.batchSize,
      leaseMs: deps.options.leaseMs,
      leaseOwner: deps.options.publisherId,
    })
    await Promise.all(events.map(event => deps.deliverEvent(event)))
  }
}
