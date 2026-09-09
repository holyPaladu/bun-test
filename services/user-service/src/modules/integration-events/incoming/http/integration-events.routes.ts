import { Elysia } from 'elysia'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { ReceiveIntegrationEvent } from '../use-cases/receive-integration-event'
import { hasBearerToken } from '../utils/bearer-token'
import { integrationSchemas } from './integration-events.schemas'

export const createIntegrationEventsRoutes = (deps: {
  consumerToken: string
  receiveIntegrationEvent: ReceiveIntegrationEvent
}) => new Elysia({
  prefix: '/internal',
  tags: ['internal'],
  normalize: false,
})
  .model(integrationSchemas)
  .post(
    '/events',
    async ({ headers, body, set }) => {
      if (!hasBearerToken(headers.authorization, deps.consumerToken)) {
        throw new UnauthorizedError()
      }

      const accepted = await deps.receiveIntegrationEvent(body)
      set.status = accepted ? 202 : 200
      return { accepted, duplicate: !accepted }
    }, {
      body: 'eventBodySchema',
      response: {
        200: 'eventResponseSchema',
        202: 'eventResponseSchema',
      },
    },
  )
