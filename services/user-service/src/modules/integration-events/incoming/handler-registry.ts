import {
  ACCOUNT_CREATED_V1,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import type { UserTransactionRepositories } from '@/shared/database/user-unit-of-work'

export interface IncomingIntegrationEventMap {
  [ACCOUNT_CREATED_V1]: AccountCreatedV1
}

export type IncomingIntegrationEvent = IncomingIntegrationEventMap[keyof IncomingIntegrationEventMap]

export type IntegrationEventHandlers = {
  [TType in keyof IncomingIntegrationEventMap]: (
    event: IncomingIntegrationEventMap[TType],
    repositories: UserTransactionRepositories,
  ) => Promise<void>
}

export const createHandlerRegistry = (handlers: IntegrationEventHandlers) => ({
  handle: async (
    event: IncomingIntegrationEvent,
    repositories: UserTransactionRepositories,
  ): Promise<void> => {
    const handler = handlers[event.type] as (
      event: IncomingIntegrationEvent,
      repositories: UserTransactionRepositories,
    ) => Promise<void>
    await handler(event, repositories)
  },
})

export type HandlerRegistry = ReturnType<typeof createHandlerRegistry>
