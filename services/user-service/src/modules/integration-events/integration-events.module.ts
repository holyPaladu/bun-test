import type { Container } from '@/container'
import { createIntegrationEventsRoutes } from './incoming/http/integration-events.routes'
import {
  createReceiveIntegrationEvent,
  type HandleIntegrationEvent,
} from './incoming/receive-integration-event'

export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
  handleEvent: HandleIntegrationEvent,
) => {
  const receiveIntegrationEvent = createReceiveIntegrationEvent({
    unitOfWork: container.unitOfWork,
    handleEvent,
  })

  return {
    incomingRoutes: createIntegrationEventsRoutes({
      consumerToken: container.env.EVENT_CONSUMER_TOKEN,
      receiveIntegrationEvent,
    }),
  }
}
