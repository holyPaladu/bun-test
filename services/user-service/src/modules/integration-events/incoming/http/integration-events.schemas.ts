import type { TUnsafe } from '@sinclair/typebox'
import {
  ACCOUNT_CREATED_V1,
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import { t } from 'elysia'
import type { IncomingIntegrationEvent } from '../types/integration-event.type'

type IncomingEventSchemas = {
  [Type in IncomingIntegrationEvent['type']]:
    TUnsafe<Extract<IncomingIntegrationEvent, { type: Type }>>
}

const incomingEventSchemas = {
  [ACCOUNT_CREATED_V1]: t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema),
} satisfies IncomingEventSchemas

export const integrationEventBodySchema =
  t.Union(Object.values(incomingEventSchemas))

export const integrationEventResponseSchema = t.Object({
  accepted: t.Boolean(),
  duplicate: t.Boolean(),
})
