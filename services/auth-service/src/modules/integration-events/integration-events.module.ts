import type { Container } from '@/container'
import { createDeliverPendingEvents } from './outgoing/deliver-pending-events'
import { createHttpEventSender } from './outgoing/http/send-event.http'
import { createDeliveryMetrics } from './outgoing/metrics/delivery.metrics'
import { createOutboxCron } from './outgoing/outbox.cron'
import { createOutboxRepository } from './outgoing/repo/outbox.repository'
import { createMetricsRoutes } from '@/shared/http/routes/metrics/metrics.routes'

const DELIVERY_OPTIONS = {
  batchSize: 10,
  leaseMs: 30_000,
  maxAttempts: 10,
  baseRetryMs: 1_000,
  maxRetryMs: 300_000,
  jitterRatio: 0.2,
} as const

const DELIVERY_REQUEST_TIMEOUT_MS = 3_000

/** Assembles the independently mounted integration-events capabilities. */
export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>,
) => {
  const outbox = createOutboxRepository(container.sql)
  const deliveryMetrics = createDeliveryMetrics(container.metricsRegistry, 'auth')
  const deliverPendingEvents = createDeliverPendingEvents({
    outbox,
    metrics: deliveryMetrics,
    logger: container.logger,
    sendEvent: createHttpEventSender({
      url: container.env.USER_EVENTS_URL,
      token: container.env.EVENT_DELIVERY_TOKEN,
      timeoutMs: DELIVERY_REQUEST_TIMEOUT_MS,
    }),
    options: {
      ...DELIVERY_OPTIONS,
      publisherId: crypto.randomUUID(),
    },
  })

  return {
    metricsRoutes: createMetricsRoutes({
      registry: container.metricsRegistry,
      namespace: 'auth',
      collectOutboxStats: outbox.getStats,
    }),
    outboxCron: createOutboxCron(container.logger, {
      pattern: container.env.OUTBOX_CRON_PATTERN,
      timezone: container.env.OUTBOX_CRON_TIMEZONE,
      deliverPendingEvents,
    }),
    replayDeadLettered: outbox.replayDeadLettered,
  }
}

export type IntegrationEventsModule = ReturnType<typeof createIntegrationEventsModule>
