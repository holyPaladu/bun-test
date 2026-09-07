import { t } from 'elysia'

export const ACCOUNT_CREATED_EVENT_TYPE = 'auth.account-created.v1' as const

export const accountCreatedEventSchema = t.Object({
  eventId: t.String({ format: 'uuid' }),
  type: t.Literal(ACCOUNT_CREATED_EVENT_TYPE),
  occurredAt: t.String({ format: 'date-time' }),
  data: t.Object({
    userId: t.String({ format: 'uuid' }),
  }, { additionalProperties: false }),
}, { additionalProperties: false })

export type AccountCreatedEvent = typeof accountCreatedEventSchema.static

/** Runtime-контракт всех входящих auth events; новые версии добавляются в union. */
export const integrationEventSchema = t.Union([accountCreatedEventSchema])
export type IntegrationEvent = typeof integrationEventSchema.static
