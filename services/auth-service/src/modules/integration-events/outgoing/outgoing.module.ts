import type { Container } from '@/container'
import { createOutboxCron } from './cron/outbox.cron'
import { createHttpEventSender } from './http/send-event.http'
import { createDeliveryMetrics } from './metrics/delivery.metrics'
import { createOutboxRepository } from './repo/outbox.repository'
import { createDeliverEventUseCase } from './use-cases/deliver-event'
import { createDeliverPendingEventsUseCase } from './use-cases/deliver-pending-events'

const DELIVERY_OPTIONS = {
  batchSize: 10,
  leaseMs: 30_000,
  maxAttempts: 10,
  baseRetryMs: 1_000,
  maxRetryMs: 300_000,
  jitterRatio: 0.2,
} as const

const DELIVERY_REQUEST_TIMEOUT_MS = 3_000

/** Assembles outgoing delivery and exposes its scheduling and operations. */
export const createOutgoingModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>,
) => {
  const outbox = createOutboxRepository(container.sql)
  const metrics = createDeliveryMetrics(container.metricsRegistry, 'auth')
  const sendEvent = createHttpEventSender({
    url: container.env.USER_EVENTS_URL,
    token: container.env.EVENT_DELIVERY_TOKEN,
    timeoutMs: DELIVERY_REQUEST_TIMEOUT_MS,
  })
  const deliverEvent = createDeliverEventUseCase({
    outbox,
    sendEvent,
    metrics,
    logger: container.logger,
    options: {
      maxAttempts: DELIVERY_OPTIONS.maxAttempts,
      baseRetryMs: DELIVERY_OPTIONS.baseRetryMs,
      maxRetryMs: DELIVERY_OPTIONS.maxRetryMs,
      jitterRatio: DELIVERY_OPTIONS.jitterRatio,
    },
  })
  const deliverPendingEvents = createDeliverPendingEventsUseCase({
    outbox,
    deliverEvent,
    options: {
      batchSize: DELIVERY_OPTIONS.batchSize,
      leaseMs: DELIVERY_OPTIONS.leaseMs,
      publisherId: crypto.randomUUID(),
    },
  })

  return {
    outboxCron: createOutboxCron(container.logger, {
      pattern: container.env.OUTBOX_CRON_PATTERN,
      timezone: container.env.OUTBOX_CRON_TIMEZONE,
      deliverPendingEvents,
    }),
    collectOutboxStats: outbox.getStats,
    replayDeadLettered: outbox.replayDeadLettered,
  }
}
