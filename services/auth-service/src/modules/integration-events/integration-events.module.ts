import type { Container } from '@/container'
import { createDeliveryMetrics } from './outgoing/metrics/delivery.metrics'
import { createOutboxCron } from './outgoing/outbox.cron'
import { createOutboxRepository } from './outgoing/repo/outbox.repository'
import { createMetricsRoutes } from '@/shared/http/routes/metrics/metrics.routes'

/** Assembles the independently mounted integration-events capabilities. */
export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>,
) => {
  const outbox = createOutboxRepository(container.sql)
  const deliveryMetrics = createDeliveryMetrics(container.metricsRegistry, 'auth')

  return {
    metricsRoutes: createMetricsRoutes({
      registry: container.metricsRegistry,
      namespace: 'auth',
      collectOutboxStats: outbox.getStats,
    }),
    outboxCron: createOutboxCron(container.logger, {
      pattern: container.env.OUTBOX_CRON_PATTERN,
      timezone: container.env.OUTBOX_CRON_TIMEZONE,
      timeoutMs: container.env.OUTBOX_WORKER_TIMEOUT_MS,
      recordAttempt: deliveryMetrics.recordAttempt,
    }),
    replayDeadLettered: outbox.replayDeadLettered,
  }
}

export type IntegrationEventsModule = ReturnType<typeof createIntegrationEventsModule>
