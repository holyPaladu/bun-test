import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'

export type OutgoingIntegrationEvent = AccountCreatedV1

export interface ClaimedOutboxEvent {
  id: string
  event: OutgoingIntegrationEvent
  occurredAt: Date
  attemptCount: number
  leaseOwner: string
}

export interface OutboxStats {
  pending: number
  deadLettered: number
  oldestPendingAgeSeconds: number
}

/** Минимальный port транзакционного бизнес-сценария. */
export interface OutboxAppendRepository {
  append(event: OutgoingIntegrationEvent, aggregateId: string): Promise<void>
}

export interface ClaimDueInput {
  limit: number
  leaseMs: number
  leaseOwner: string
}

export interface UpdateClaimInput {
  eventId: string
  leaseOwner: string
}

/** Изменения возвращают false, когда lease истёк или уже принадлежит другому worker. */
export interface OutboxDeliveryRepository {
  claimDue(input: ClaimDueInput): Promise<ClaimedOutboxEvent[]>
  markPublished(input: UpdateClaimInput): Promise<boolean>
  markFailed(input: UpdateClaimInput & {
    error: string
    nextAttemptAt: Date
  }): Promise<boolean>
  markDeadLettered(input: UpdateClaimInput & { error: string }): Promise<boolean>
  /** Ручной replay сохраняет исходные eventId и payload. */
  replayDeadLettered(eventId: string): Promise<boolean>
}

export interface OutboxStatsRepository {
  getStats(): Promise<OutboxStats>
}

export type OutboxRepository = OutboxAppendRepository
  & OutboxDeliveryRepository
  & OutboxStatsRepository
