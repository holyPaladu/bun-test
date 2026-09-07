import {
  ACCOUNT_CREATED_EVENT_TYPE,
  type IntegrationEvent,
} from '@/modules/integration-events/events'
import type { UserUnitOfWork } from '@/shared/database/user-unit-of-work'

interface ProcessIntegrationEventDeps {
  unitOfWork: UserUnitOfWork
}

const unsupportedEvent = (event: IntegrationEvent): never => {
  throw new Error(`Unsupported integration event: ${JSON.stringify(event)}`)
}

/** Явный dispatcher: новый тип события обязан добавить новую ветку обработки. */
export const ProcessIntegrationEventUseCase = ({ unitOfWork }: ProcessIntegrationEventDeps) =>
  (event: IntegrationEvent): Promise<boolean> => {
    switch (event.type) {
      case ACCOUNT_CREATED_EVENT_TYPE:
        return unitOfWork.run(async ({ inbox, userProfiles }) => {
          const firstDelivery = await inbox.reserve(event)
          if (!firstDelivery) return false

          await userProfiles.createIfAbsent(event.data.userId)
          return true
        })
      default:
        return unsupportedEvent(event)
    }
  }

export type ProcessIntegrationEvent = ReturnType<typeof ProcessIntegrationEventUseCase>
