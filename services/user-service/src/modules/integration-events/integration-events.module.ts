import type { Container } from '@/container'
import { IntegrationEventsRoutes } from '@/modules/integration-events/integration-events.routes'
import { ProcessIntegrationEventUseCase } from '@/modules/integration-events/process-integration-event'

export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
) => IntegrationEventsRoutes({
  consumerToken: container.env.EVENT_CONSUMER_TOKEN,
  processIntegrationEvent: ProcessIntegrationEventUseCase({ unitOfWork: container.unitOfWork }),
})
