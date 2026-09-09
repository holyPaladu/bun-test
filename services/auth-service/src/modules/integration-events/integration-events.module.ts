import type { Container } from '@/container'
import { createOutgoingModule } from './outgoing/outgoing.module'
import { createMetricsRoutes } from '@/shared/http/routes/metrics/metrics.routes'

/** Assembles the independently mounted integration-events capabilities. */
export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'sql' | 'logger' | 'metricsRegistry'>,
) => {
  const outgoing = createOutgoingModule(container)

  return {
    metricsRoutes: createMetricsRoutes({
      registry: container.metricsRegistry,
      namespace: 'auth',
      collectOutboxStats: outgoing.collectOutboxStats,
    }),
    outboxCron: outgoing.outboxCron,
    replayDeadLettered: outgoing.replayDeadLettered,
  }
}

export type IntegrationEventsModule = ReturnType<typeof createIntegrationEventsModule>
