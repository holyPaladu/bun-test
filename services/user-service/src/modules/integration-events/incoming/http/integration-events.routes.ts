import { Elysia } from 'elysia'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { ReceiveIntegrationEvent } from '../use-cases/receive-integration-event'
import { hasBearerToken } from '../utils/bearer-token'
import {
  integrationEventBodySchema,
  integrationEventResponseSchema,
} from './integration-events.schemas'

export const createIntegrationEventsRoutes = (deps: {
  consumerToken: string
  receiveIntegrationEvent: ReceiveIntegrationEvent
}) => new Elysia({
  prefix: '/internal',
  tags: ['internal'],
  normalize: false,
})
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
      body: integrationEventBodySchema,
      response: {
        200: integrationEventResponseSchema,
        202: integrationEventResponseSchema,
      },
    },
  )
