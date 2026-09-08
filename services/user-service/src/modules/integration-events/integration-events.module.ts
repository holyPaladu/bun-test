import type { Container } from '@/container'
import { createHandlerRegistry, type IntegrationEventHandlers } from './incoming/handler-registry'
import { createIntegrationEventsRoutes } from './incoming/http/integration-events.routes'
import { createReceiveIntegrationEvent } from './incoming/receive-integration-event'

export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
  eventHandlers: IntegrationEventHandlers,
) => {
  const handlers = createHandlerRegistry(eventHandlers)
  const receiveIntegrationEvent = createReceiveIntegrationEvent({
    unitOfWork: container.unitOfWork,
    handlers,
  })

  return {
    incomingRoutes: createIntegrationEventsRoutes({
      consumerToken: container.env.EVENT_CONSUMER_TOKEN,
      receiveIntegrationEvent,
    }),
  }
}
