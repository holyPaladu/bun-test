import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import { getRetryDelayMs, shouldDeadLetter, type RetryPolicy } from './retry-policy'
import type { DeliveryMetrics } from './metrics/delivery.metrics'
import type { Logger } from '@/shared/lib/logger/logger'

type OutgoingIntegrationEvent = AccountCreatedV1
type SendEvent = (event: OutgoingIntegrationEvent) => Promise<void>

/** A rejected delivery with an explicit retry classification from its adapter. */
export class EventDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'EventDeliveryError'
  }
}

export interface ClaimedOutboxEvent {
  id: string
  event: OutgoingIntegrationEvent
  occurredAt: Date
  attemptCount: number
  leaseOwner: string
}

type OutboxDeliveryPort = {
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
  workerId: string
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

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)

const isRetryable = (error: unknown): boolean =>
  !(error instanceof EventDeliveryError) || error.retryable

const recordSafely = (
  metrics: DeliveryMetrics,
  logger: Logger,
  input: Parameters<DeliveryMetrics['recordAttempt']>[0],
): void => {
  try {
    metrics.recordAttempt(input)
  } catch (error) {
    logger.warn('Failed to record outbox delivery metrics', { error: errorMessage(error) })
  }
}

export const createDeliverPendingEvents = ({
  outbox,
  sendEvent,
  metrics,
  logger,
  options,
  now = () => new Date(),
  random = Math.random,
}: DeliverPendingEventsDeps) => {
  const persistResult = async (
    claimed: ClaimedOutboxEvent,
    outcome: 'published' | 'retry' | 'dead_letter',
    durationSeconds: number,
    error?: unknown,
  ): Promise<void> => {
    const claim = { eventId: claimed.id, leaseOwner: claimed.leaseOwner }
    let updated: boolean

    try {
      if (outcome === 'published') {
        updated = await outbox.markPublished(claim)
      } else if (outcome === 'dead_letter') {
        updated = await outbox.markDeadLettered({ ...claim, error: errorMessage(error) })
      } else {
        const delayMs = getRetryDelayMs(claimed.attemptCount, options, random)
        updated = await outbox.markFailed({
          ...claim,
          error: errorMessage(error),
          nextAttemptAt: new Date(now().getTime() + delayMs),
        })
      }
    } catch (persistenceError) {
      logger.error('Failed to persist outbox delivery result', {
        eventId: claimed.id,
        eventType: claimed.event.type,
        outcome,
        error: errorMessage(persistenceError),
      })
      throw persistenceError
    }

    if (!updated) {
      logger.warn('Ignored outbox result from stale lease owner', {
        eventId: claimed.id,
        eventType: claimed.event.type,
        workerId: claimed.leaseOwner,
      })
      return
    }

    recordSafely(metrics, logger, {
      eventType: claimed.event.type,
      outcome,
      durationSeconds,
      occurredAt: claimed.occurredAt,
      completedAt: now(),
    })
  }

  const deliverOne = async (claimed: ClaimedOutboxEvent): Promise<void> => {
    const startedAt = now().getTime()
    let delivered = false
    let deliveryError: unknown
    try {
      await sendEvent(claimed.event)
      delivered = true
    } catch (error) {
      deliveryError = error
    }

    const durationSeconds = (now().getTime() - startedAt) / 1_000
    if (delivered) {
      // Ошибка этой записи выйдет из функции как persistence error и не станет retry доставки.
      await persistResult(claimed, 'published', durationSeconds)
      return
    }

    const retryable = isRetryable(deliveryError)
    const outcome = shouldDeadLetter(claimed.attemptCount, options.maxAttempts, retryable)
      ? 'dead_letter'
      : 'retry'
    await persistResult(claimed, outcome, durationSeconds, deliveryError)

    const log = outcome === 'dead_letter' ? logger.error : logger.warn
    log(outcome === 'dead_letter'
      ? 'Outbox event moved to dead letter'
      : 'Outbox delivery failed; retry scheduled', {
      eventId: claimed.id,
      eventType: claimed.event.type,
      attempt: claimed.attemptCount,
      error: errorMessage(deliveryError),
    })
  }

  return async function deliverPendingEvents(): Promise<void> {
    const events = await outbox.claimDue({
      limit: options.batchSize,
      leaseMs: options.leaseMs,
      leaseOwner: options.workerId,
    })
    await Promise.all(events.map(deliverOne))
  }
}

export type DeliverPendingEvents = ReturnType<typeof createDeliverPendingEvents>
