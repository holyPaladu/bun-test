export const ACCOUNT_CREATED_EVENT_TYPE = 'auth.account-created.v1' as const

export interface AccountCreatedEvent {
  eventId: string
  type: typeof ACCOUNT_CREATED_EVENT_TYPE
  occurredAt: string
  data: {
    userId: string
  }
}

/** Все исходящие integration events auth-service; расширяется новыми версиями. */
export type IntegrationEvent = AccountCreatedEvent

export const createAccountCreatedEvent = (
  userId: string,
  now: Date = new Date(),
): AccountCreatedEvent => ({
  eventId: crypto.randomUUID(),
  type: ACCOUNT_CREATED_EVENT_TYPE,
  occurredAt: now.toISOString(),
  data: { userId },
})
