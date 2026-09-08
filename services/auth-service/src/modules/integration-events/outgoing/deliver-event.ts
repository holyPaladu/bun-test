import { errorMessage, isRetryableDeliveryError } from './delivery-error'
import type {
  ClaimedOutboxEvent,
  DeliverPendingEventsDeps,
} from './deliver-pending-events'
import { getRetryDelayMs, shouldDeadLetter } from './retry-policy'
import type { DeliveryOutcome } from './metrics/delivery.metrics'

const recordMetrics = (
  deps: DeliverPendingEventsDeps,
  event: ClaimedOutboxEvent,
  outcome: DeliveryOutcome,
  durationSeconds: number,
  completedAt: Date,
): void => {
  try {
    deps.metrics.recordAttempt({
      eventType: event.event.type,
      outcome,
      durationSeconds,
      occurredAt: event.occurredAt,
      completedAt,
    })
  } catch (error) {
    deps.logger.warn('Failed to record outbox delivery metrics', {
      error: errorMessage(error),
    })
  }
}

/** Delivers one claimed event and persists exactly one resulting state. */
export const createDeliverEvent = (deps: DeliverPendingEventsDeps) => {
  const now = deps.now ?? (() => new Date())
  const random = deps.random ?? Math.random

  const persistResult = async (
    event: ClaimedOutboxEvent,
    outcome: DeliveryOutcome,
    durationSeconds: number,
    deliveryError?: unknown,
  ): Promise<void> => {
    const claim = { eventId: event.id, leaseOwner: event.leaseOwner }
    let updated: boolean

    try {
      if (outcome === 'published') {
        updated = await deps.outbox.markPublished(claim)
      } else if (outcome === 'dead_letter') {
        updated = await deps.outbox.markDeadLettered({
          ...claim,
          error: errorMessage(deliveryError),
        })
      } else {
        const retryDelayMs = getRetryDelayMs(event.attemptCount, deps.options, random)
        updated = await deps.outbox.markFailed({
          ...claim,
          error: errorMessage(deliveryError),
          nextAttemptAt: new Date(now().getTime() + retryDelayMs),
        })
      }
    } catch (error) {
      deps.logger.error('Failed to persist outbox delivery result', {
        eventId: event.id,
        eventType: event.event.type,
        outcome,
        error: errorMessage(error),
      })
      throw error
    }

    if (!updated) {
      deps.logger.warn('Ignored outbox result from stale lease owner', {
        eventId: event.id,
        eventType: event.event.type,
        publisherId: event.leaseOwner,
      })
      return
    }

    recordMetrics(deps, event, outcome, durationSeconds, now())
  }

  return async (event: ClaimedOutboxEvent): Promise<void> => {
    const startedAt = now().getTime()

    try {
      await deps.sendEvent(event.event)
    } catch (deliveryError) {
      const retryable = isRetryableDeliveryError(deliveryError)
      const outcome = shouldDeadLetter(
        event.attemptCount,
        deps.options.maxAttempts,
        retryable,
      ) ? 'dead_letter' : 'retry'

      await persistResult(
        event,
        outcome,
        (now().getTime() - startedAt) / 1_000,
        deliveryError,
      )

      const log = outcome === 'dead_letter' ? deps.logger.error : deps.logger.warn
      log(outcome === 'dead_letter'
        ? 'Outbox event moved to dead letter'
        : 'Outbox delivery failed; retry scheduled', {
        eventId: event.id,
        eventType: event.event.type,
        attempt: event.attemptCount,
        error: errorMessage(deliveryError),
      })
      return
    }

    // Persistence failures are not delivery failures and must not schedule an HTTP retry.
    await persistResult(event, 'published', (now().getTime() - startedAt) / 1_000)
  }
}
