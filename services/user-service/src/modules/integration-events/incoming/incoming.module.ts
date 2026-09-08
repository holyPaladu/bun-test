import type { Container } from '@/container'
import { createIntegrationEventsRoutes } from './http/integration-events.routes'
import { createReceiveIntegrationEventUseCase } from './use-cases/receive-integration-event'
import {
  createIntegrationEventDispatcher,
  type IntegrationEventHandlers,
} from './utils/dispatch-integration-event'

/** Composes incoming event dispatch, transaction handling, and HTTP delivery. */
export const createIncomingModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
  handlers: IntegrationEventHandlers,
) => {
  const handleEvent = createIntegrationEventDispatcher(handlers)
  const receiveIntegrationEvent = createReceiveIntegrationEventUseCase({
    unitOfWork: container.unitOfWork,
    handleEvent,
  })

  return createIntegrationEventsRoutes({
    consumerToken: container.env.EVENT_CONSUMER_TOKEN,
    receiveIntegrationEvent,
  })
}
