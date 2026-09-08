import { timingSafeEqual } from 'node:crypto'
import { Elysia, t } from 'elysia'
import {
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { ReceiveIntegrationEvent } from '../receive-integration-event'

const integrationEventSchema = t.Union([
  t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema),
])

const hasValidBearerToken = (authorization: string | undefined, expected: string): boolean => {
  if (!authorization?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authorization.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export const createIntegrationEventsRoutes = (deps: {
  consumerToken: string
  receiveIntegrationEvent: ReceiveIntegrationEvent
}) => new Elysia({ prefix: '/internal', tags: ['internal'] })
  .post('/events', async ({ headers, body, set }) => {
    if (!hasValidBearerToken(headers.authorization, deps.consumerToken)) {
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
