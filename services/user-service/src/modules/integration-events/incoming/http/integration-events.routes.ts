import { Elysia, t } from 'elysia'
import {
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { ReceiveIntegrationEvent } from '../receive-integration-event'
import { hasBearerToken } from './bearer-token'

const integrationEventSchema = t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema)

export const createIntegrationEventsRoutes = (deps: {
  consumerToken: string
  receiveIntegrationEvent: ReceiveIntegrationEvent
}) => new Elysia({ prefix: '/internal', tags: ['internal'] })
  .post('/events', async ({ headers, body, set }) => {
    if (!hasBearerToken(headers.authorization, deps.consumerToken)) {
      throw new UnauthorizedError()
    }
    const accepted = await deps.receiveIntegrationEvent(body)
    set.status = accepted ? 202 : 200
    return { accepted, duplicate: !accepted }
  }, {
    body: integrationEventSchema,
    response: {
      200: t.Object({ accepted: t.Boolean(), duplicate: t.Boolean() }),
      202: t.Object({ accepted: t.Boolean(), duplicate: t.Boolean() }),
    },
  })
