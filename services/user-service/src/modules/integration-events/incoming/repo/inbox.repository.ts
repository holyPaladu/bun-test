import type { IncomingIntegrationEvent } from '../handler-registry'

export interface InboxRepository {
  /** true — eventId зарезервирован этой транзакцией; false — это повтор. */
  reserve(event: IncomingIntegrationEvent): Promise<boolean>
}
