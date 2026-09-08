import { createEventEnvelopeSchema, schemaKind, type Static } from '../event-envelope'

/** Владелец контракта: auth-service / модуль auth. */
export const ACCOUNT_CREATED_V1 = 'auth.account-created.v1' as const

export const accountCreatedV1Schema = createEventEnvelopeSchema(
  ACCOUNT_CREATED_V1,
  {
    [schemaKind]: 'Object',
    type: 'object',
    properties: {
      userId: { [schemaKind]: 'String', type: 'string', format: 'uuid' },
    },
    required: ['userId'],
    additionalProperties: false,
  },
)

export type AccountCreatedV1 = Static<typeof accountCreatedV1Schema>

export const accountCreatedV1Example: AccountCreatedV1 = {
  eventId: '4c203a1c-d810-47ba-9e44-7d881a526ee2',
  type: ACCOUNT_CREATED_V1,
  occurredAt: '2026-09-07T10:00:00.000Z',
  data: { userId: '550e8400-e29b-41d4-a716-446655440000' },
}
