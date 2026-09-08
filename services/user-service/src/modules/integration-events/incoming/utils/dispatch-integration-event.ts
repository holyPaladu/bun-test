import { ACCOUNT_CREATED_V1 } from '@test-project/integration-event-contracts'
import type { UserTransactionRepositories } from '@/shared/database/user-unit-of-work'
import type { IncomingIntegrationEvent } from '../types/integration-event.type'

export type IntegrationEventHandlers = {
  [Event in IncomingIntegrationEvent as Event['type']]: (
    event: Event,
    repositories: UserTransactionRepositories,
  ) => Promise<void>
}

const unsupportedIntegrationEventType = (type: never): never => {
  throw new Error(`Unsupported integration event type: ${String(type)}`)
}

export const createIntegrationEventDispatcher = (
  handlers: IntegrationEventHandlers,
) => async (
  event: IncomingIntegrationEvent,
  repositories: UserTransactionRepositories,
): Promise<void> => {
  const type = event.type

  switch (type) {
    case ACCOUNT_CREATED_V1:
      await handlers[ACCOUNT_CREATED_V1](event, repositories)
      return
    default:
      return unsupportedIntegrationEventType(type)
  }
}

export type HandleIntegrationEvent =
  ReturnType<typeof createIntegrationEventDispatcher>
