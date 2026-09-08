import type { Container } from '@/container'
import { createDeliverPendingEvents } from './outgoing/deliver-pending-events'
import { createHttpEventSender } from './outgoing/http/send-event.http'
import { createDeliveryMetrics } from './outgoing/metrics/delivery.metrics'
import { createOutboxWorker } from './outgoing/outbox.worker'
import { createPostgresOutboxRepository } from './outgoing/repo/postgres-outbox.repository'
import { createMetricsRoutes } from '@/shared/http/routes/metrics/metrics.routes'

/** Одна видимая policy вместо набора преждевременных deployment-настроек. */
const OUTBOX_POLICY = {
  // Один цикл обрабатывает доступную ёмкость параллельно и укладывается в lease.
  batchSize: 10,
  pollIntervalMs: 1_000,
  leaseMs: 30_000,
  maxAttempts: 10,
  baseRetryMs: 1_000,
  maxRetryMs: 300_000,
  jitterRatio: 0.2,
  requestTimeoutMs: 3_000,
} as const

/** Собирает repository, один delivery cycle, worker и технические метрики. */
export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>,
) => {
  const outbox = createPostgresOutboxRepository(container.sql)
  const deliveryMetrics = createDeliveryMetrics(container.metricsRegistry, 'auth')
  const deliverPendingEvents = createDeliverPendingEvents({
    outbox,
    sendEvent: createHttpEventSender({
      url: container.env.USER_EVENTS_URL,
      token: container.env.EVENT_DELIVERY_TOKEN,
      timeoutMs: OUTBOX_POLICY.requestTimeoutMs,
    }),
    metrics: deliveryMetrics,
    logger: container.logger,
    options: {
      workerId: crypto.randomUUID(),
      batchSize: OUTBOX_POLICY.batchSize,
      leaseMs: OUTBOX_POLICY.leaseMs,
      maxAttempts: OUTBOX_POLICY.maxAttempts,
      baseRetryMs: OUTBOX_POLICY.baseRetryMs,
      maxRetryMs: OUTBOX_POLICY.maxRetryMs,
      jitterRatio: OUTBOX_POLICY.jitterRatio,
    },
  })

  return {
    metricsRoutes: createMetricsRoutes({
      registry: container.metricsRegistry,
      namespace: 'auth',
      collectOutboxStats: outbox.getStats,
    }),
    outboxWorker: createOutboxWorker({
      deliverPendingEvents,
      pollIntervalMs: OUTBOX_POLICY.pollIntervalMs,
      logger: container.logger,
    }),
    replayDeadLettered: outbox.replayDeadLettered,
  }
}

export type IntegrationEventsModule = ReturnType<typeof createIntegrationEventsModule>
