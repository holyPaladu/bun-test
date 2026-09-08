import type { UserUnitOfWork } from '@/shared/database/user-unit-of-work'
import type { HandlerRegistry, IncomingIntegrationEvent } from './handler-registry'

export interface ReceiveIntegrationEventDeps {
  unitOfWork: UserUnitOfWork
  handlers: HandlerRegistry
}

/** Inbox и бизнес-эффект выполняются в одной транзакции и подтверждаются после commit. */
export const createReceiveIntegrationEvent = ({
  unitOfWork,
  handlers,
}: ReceiveIntegrationEventDeps) => (event: IncomingIntegrationEvent): Promise<boolean> =>
  unitOfWork.run(async repositories => {
    const firstDelivery = await repositories.inbox.reserve(event)
    if (!firstDelivery) return false
    await handlers.handle(event, repositories)
    return true
  })

export type ReceiveIntegrationEvent = ReturnType<typeof createReceiveIntegrationEvent>
