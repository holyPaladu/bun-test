import type { Container } from '@/container'
import { userProfileIntegrationEventHandlers } from '@/modules/user-profile/user-profile.module'
import { createIncomingModule } from './incoming/incoming.module'
import type { IntegrationEventHandlers } from './incoming/utils/dispatch-integration-event'

export const createIntegrationEventsModule = (
  container: Pick<Container, 'env' | 'unitOfWork'>,
) => {
  const handlers = {
    ...userProfileIntegrationEventHandlers,
  } satisfies IntegrationEventHandlers

  return {
    incomingRoutes: createIncomingModule(container, handlers),
  }
}

export type IntegrationEventsModule =
  ReturnType<typeof createIntegrationEventsModule>
