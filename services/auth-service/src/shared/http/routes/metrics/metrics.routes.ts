import { Elysia } from 'elysia'
import type { PrometheusRegistry } from './prometheus.registry'

export interface MetricsRoutesDeps {
  registry: PrometheusRegistry
  namespace: string
  collectOutboxStats: () => Promise<{
    pending: number
    deadLettered: number
    oldestPendingAgeSeconds: number
  }>
}

export const createMetricsRoutes = ({
  registry,
  namespace,
  collectOutboxStats,
}: MetricsRoutesDeps) => new Elysia({ tags: ['system'] })
  .get('/metrics', async ({ set }) => {
    set.headers['content-type'] = 'text/plain; version=0.0.4; charset=utf-8'
    return registry.render([async () => {
      const stats = await collectOutboxStats()
      return [
        `# HELP ${namespace}_outbox_pending_events Events waiting for delivery.`,
        `# TYPE ${namespace}_outbox_pending_events gauge`,
        `${namespace}_outbox_pending_events ${stats.pending}`,
        `# HELP ${namespace}_outbox_dead_letter_events Events abandoned after delivery failure.`,
        `# TYPE ${namespace}_outbox_dead_letter_events gauge`,
        `${namespace}_outbox_dead_letter_events ${stats.deadLettered}`,
        `# HELP ${namespace}_outbox_oldest_pending_age_seconds Age of the oldest pending event.`,
        `# TYPE ${namespace}_outbox_oldest_pending_age_seconds gauge`,
        `${namespace}_outbox_oldest_pending_age_seconds ${stats.oldestPendingAgeSeconds}`,
      ]
    }])
  })
