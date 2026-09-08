import type {
  UserTransactionRepositories,
  UserUnitOfWork,
} from '@/shared/database/user-unit-of-work'
import type { IncomingIntegrationEvent } from '../types/integration-event.type'

export type ReceiveIntegrationEventInput = IncomingIntegrationEvent
export type ReceiveIntegrationEventResult = boolean

export interface ReceiveIntegrationEventDeps {
  unitOfWork: UserUnitOfWork
  handleEvent: (
    event: IncomingIntegrationEvent,
    repositories: UserTransactionRepositories,
  ) => Promise<void>
}

/** Inbox reservation and the business effect commit in the same transaction. */
export const createReceiveIntegrationEventUseCase = ({
  unitOfWork,
  handleEvent,
}: ReceiveIntegrationEventDeps) => (
  event: ReceiveIntegrationEventInput,
): Promise<ReceiveIntegrationEventResult> =>
  unitOfWork.run(async repositories => {
    const firstDelivery = await repositories.inbox.reserve({
      eventId: event.eventId,
      eventType: event.type,
      occurredAt: event.occurredAt,
    })
    if (!firstDelivery) return false

    await handleEvent(event, repositories)
    return true
  })

export type ReceiveIntegrationEvent =
  ReturnType<typeof createReceiveIntegrationEventUseCase>
