import type { Container } from '@/container'
import { Elysia } from 'elysia'
import {
  HttpEventDeliveryTransport,
  OutboxPublisher,
} from '@/modules/integration-events/outbox.publisher'
import { OutboxRepository } from '@/modules/integration-events/outbox.repository'
import { OutboxMetrics } from '@/modules/integration-events/outbox.metrics'

/** Одна видимая policy вместо набора преждевременных deployment-настроек. */
const OUTBOX_POLICY = {
  batchSize: 50,
  pollIntervalMs: 1_000,
  leaseMs: 30_000,
  maxAttempts: 10,
  baseRetryMs: 1_000,
  maxRetryMs: 300_000,
  requestTimeoutMs: 3_000,
} as const

/** Собирает outbox repository, publisher и его технические метрики. */
export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger'>,
) => {
  const repository = OutboxRepository(container.sql)
  const metrics = new OutboxMetrics()
  const metricsRoutes = new Elysia({ tags: ['system'] })
    .get('/metrics', async ({ set }) => {
      set.headers['content-type'] = 'text/plain; version=0.0.4; charset=utf-8'
      return metrics.render(await repository.stats())
    })

  return {
    metricsRoutes,
    publisher: new OutboxPublisher({
      repository,
      transport: HttpEventDeliveryTransport({
        url: container.env.USER_EVENTS_URL,
        token: container.env.EVENT_DELIVERY_TOKEN,
        timeoutMs: OUTBOX_POLICY.requestTimeoutMs,
      }),
      metrics,
      logger: container.logger,
      options: {
        batchSize: OUTBOX_POLICY.batchSize,
        pollIntervalMs: OUTBOX_POLICY.pollIntervalMs,
        leaseMs: OUTBOX_POLICY.leaseMs,
        maxAttempts: OUTBOX_POLICY.maxAttempts,
        baseRetryMs: OUTBOX_POLICY.baseRetryMs,
        maxRetryMs: OUTBOX_POLICY.maxRetryMs,
      },
    }),
  }
}

export type IntegrationEventsModule = ReturnType<typeof createIntegrationEventsModule>
