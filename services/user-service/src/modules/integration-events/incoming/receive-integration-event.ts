import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import type {
  UserTransactionRepositories,
  UserUnitOfWork,
} from '@/shared/database/user-unit-of-work'

export type HandleIntegrationEvent = (
  event: AccountCreatedV1,
  repositories: UserTransactionRepositories,
) => Promise<void>

export interface ReceiveIntegrationEventDeps {
  unitOfWork: UserUnitOfWork
  handleEvent: HandleIntegrationEvent
}

/** Inbox и бизнес-эффект выполняются в одной транзакции и подтверждаются после commit. */
export const createReceiveIntegrationEvent = ({
  unitOfWork,
  handleEvent,
}: ReceiveIntegrationEventDeps) => (event: AccountCreatedV1): Promise<boolean> =>
  unitOfWork.run(async repositories => {
    const firstDelivery = await repositories.inbox.reserve(event)
    if (!firstDelivery) return false
    await handleEvent(event, repositories)
    return true
  })

export type ReceiveIntegrationEvent = ReturnType<typeof createReceiveIntegrationEvent>
