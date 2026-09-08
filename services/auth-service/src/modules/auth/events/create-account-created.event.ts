import {
  ACCOUNT_CREATED_V1,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'

export interface CreateAccountCreatedEventOptions {
  eventId?: string
  occurredAt?: Date
}

/** eventId создаётся здесь один раз; outbox сохраняет и повторяет тот же envelope. */
export const createAccountCreatedEvent = (
  userId: string,
  options: CreateAccountCreatedEventOptions = {},
): AccountCreatedV1 => ({
  eventId: options.eventId ?? crypto.randomUUID(),
  type: ACCOUNT_CREATED_V1,
  occurredAt: (options.occurredAt ?? new Date()).toISOString(),
  data: { userId },
})
