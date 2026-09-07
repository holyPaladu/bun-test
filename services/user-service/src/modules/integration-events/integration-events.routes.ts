import { timingSafeEqual } from 'node:crypto'
import { Elysia, t } from 'elysia'
import { integrationEventSchema } from '@/modules/integration-events/events'
import type { ProcessIntegrationEvent } from '@/modules/integration-events/process-integration-event'
import { UnauthorizedError } from '@/shared/errors/app-error'

const hasValidBearerToken = (authorization: string | undefined, expected: string): boolean => {
  if (!authorization?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authorization.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export const IntegrationEventsRoutes = (deps: {
  consumerToken: string
  processIntegrationEvent: ProcessIntegrationEvent
}) => new Elysia({ prefix: '/internal', tags: ['internal'] })
  .post('/events', async ({ headers, body, set }) => {
    if (!hasValidBearerToken(headers.authorization, deps.consumerToken)) {
      throw new UnauthorizedError()
    }

    const accepted = await deps.processIntegrationEvent(body)
    set.status = accepted ? 202 : 200
    return { accepted, duplicate: !accepted }
  }, {
    body: integrationEventSchema,
    response: {
      200: t.Object({ accepted: t.Boolean(), duplicate: t.Boolean() }),
      202: t.Object({ accepted: t.Boolean(), duplicate: t.Boolean() }),
    },
  })
