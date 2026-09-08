import { describe, expect, mock, test } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import {
  ACCOUNT_CREATED_V1,
  accountCreatedV1Example,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import { Elysia } from 'elysia'
import { createIntegrationEventsModule } from '@/modules/integration-events/integration-events.module'
import { createIntegrationEventsRoutes } from '@/modules/integration-events/incoming/http/integration-events.routes'
import { integrationEventBodySchema } from '@/modules/integration-events/incoming/http/integration-events.schemas'
import type { IncomingIntegrationEvent } from '@/modules/integration-events/incoming/types/integration-event.type'
import { createReceiveIntegrationEventUseCase } from '@/modules/integration-events/incoming/use-cases/receive-integration-event'
import { createIntegrationEventDispatcher } from '@/modules/integration-events/incoming/utils/dispatch-integration-event'
import { onAccountCreated } from '@/modules/user-profile/events/on-account-created'
import type { Env } from '@/shared/config/env'
import type {
  UserTransactionRepositories,
  UserUnitOfWork,
} from '@/shared/database/user-unit-of-work'
import { createErrorHandler } from '@/shared/http/error-handler'

const token = 'test-consumer-token'
const event: AccountCreatedV1 = accountCreatedV1Example
const env: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgres://localhost/user_service_test',
  AUTH_JWKS_URL: 'http://localhost/.well-known/jwks.json',
  AUTH_JWT_ISSUER: 'auth-service',
  AUTH_JWT_AUDIENCE: 'api',
  AUTH_JWKS_TIMEOUT_MS: 3000,
  AUTH_JWT_CLOCK_TOLERANCE_SEC: 5,
  EVENT_CONSUMER_TOKEN: token,
  LOG_LEVEL: 'error',
}

const createRepositories = (
  reserve: UserTransactionRepositories['inbox']['reserve'],
) => {
  const inbox = { reserve }
  const userProfiles = {
    createIfAbsent: mock(async () => {}),
    findById: mock(async () => null),
    update: mock(async () => null),
  }
  const unitOfWork: UserUnitOfWork = {
    run: mock(async work => work({ inbox, userProfiles })),
  }
  return { inbox, userProfiles, unitOfWork }
}

const createReceiver = (unitOfWork: UserUnitOfWork) =>
  createReceiveIntegrationEventUseCase({
    unitOfWork,
    handleEvent: onAccountCreated,
  })

const createTestApp = (
  receiveIntegrationEvent: (event: IncomingIntegrationEvent) => Promise<boolean>,
) => {
  const noop = () => undefined
  return new Elysia({ normalize: false })
    .use(createErrorHandler({ debug: noop, info: noop, warn: noop, error: noop }))
    .use(createIntegrationEventsRoutes({ consumerToken: token, receiveIntegrationEvent }))
}

const eventRequest = (
  body: unknown,
  authorization: string | null = `Bearer ${token}`,
) => new Request('http://service/internal/events', {
  method: 'POST',
  headers: {
    ...(authorization ? { authorization } : {}),
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})

describe('incoming integration events', () => {
  test('the producer example conforms to the complete consumer schema', () => {
    expect(Value.Check(integrationEventBodySchema, event)).toBe(true)
    expect(Value.Check(integrationEventBodySchema, { ...event, extra: true })).toBe(false)
  })

  test('reserves only inbox metadata and applies the first delivery once', async () => {
    const reserve = mock(async () => true)
    reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const context = createRepositories(reserve)
    const receive = createReceiver(context.unitOfWork)

    await expect(receive(event)).resolves.toBe(true)
    await expect(receive(event)).resolves.toBe(false)
    expect(reserve).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventType: event.type,
      occurredAt: event.occurredAt,
    })
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledTimes(1)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledWith(event.data.userId)
  })

  test('lets a handler failure roll back the surrounding transaction', async () => {
    const context = createRepositories(mock(async () => true))
    context.userProfiles.createIfAbsent = mock(async () => {
      throw new Error('profile failed')
    })

    await expect(createReceiver(context.unitOfWork)(event)).rejects.toThrow('profile failed')
    expect(context.unitOfWork.run).toHaveBeenCalledTimes(1)
  })

  test('dispatches an event to its typed handler', async () => {
    const context = createRepositories(mock(async () => true))
    const accountCreated = mock(async () => {})
    const dispatch = createIntegrationEventDispatcher({
      [ACCOUNT_CREATED_V1]: accountCreated,
    })
    const repositories = {
      inbox: context.inbox,
      userProfiles: context.userProfiles,
    }

    await dispatch(event, repositories)

    expect(accountCreated).toHaveBeenCalledWith(event, repositories)
  })

  test('rejects an unsupported runtime type in the defensive dispatch branch', async () => {
    const context = createRepositories(mock(async () => true))
    const dispatch = createIntegrationEventDispatcher({
      [ACCOUNT_CREATED_V1]: mock(async () => {}),
    })
    const repositories = {
      inbox: context.inbox,
      userProfiles: context.userProfiles,
    }
    const unsupported = {
      ...event,
      type: 'auth.account-created.v2',
    } as unknown as IncomingIntegrationEvent

    await expect(dispatch(unsupported, repositories))
      .rejects.toThrow('Unsupported integration event type: auth.account-created.v2')
  })

  test('protects the endpoint and acknowledges first and duplicate deliveries', async () => {
    const receiveIntegrationEvent = mock(async () => true)
    receiveIntegrationEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const app = createTestApp(receiveIntegrationEvent)

    const unauthorized = await app.handle(eventRequest(event, null))
    expect(unauthorized.status).toBe(401)

    const accepted = await app.handle(eventRequest(event))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ accepted: true, duplicate: false })

    const duplicate = await app.handle(eventRequest(event))
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toEqual({ accepted: false, duplicate: true })
    expect(receiveIntegrationEvent).toHaveBeenCalledTimes(2)
    expect(receiveIntegrationEvent).toHaveBeenCalledWith(event)
  })

  test('rejects unsupported types and malformed envelopes before the use case', async () => {
    const receiveIntegrationEvent = mock(async () => true)
    const app = createTestApp(receiveIntegrationEvent)
    const invalidBodies = [
      { ...event, type: 'auth.account-created.v2' },
      { ...event, data: { accountId: event.data.userId } },
      { type: event.type, occurredAt: event.occurredAt, data: event.data },
      { ...event, eventId: 'not-a-uuid' },
      { ...event, occurredAt: 'yesterday' },
      { ...event, extra: true },
      { ...event, data: { ...event.data, extra: true } },
    ]

    for (const body of invalidBodies) {
      const response = await app.handle(eventRequest(body))
      expect(response.status).toBe(422)
    }
    expect(receiveIntegrationEvent).not.toHaveBeenCalled()
  })

  test('the public integration-events module wires the profile handler', async () => {
    const context = createRepositories(mock(async () => true))
    const integrationEvents = createIntegrationEventsModule({
      env,
      unitOfWork: context.unitOfWork,
    })
    const noop = () => undefined
    const app = new Elysia({ normalize: false })
      .use(createErrorHandler({ debug: noop, info: noop, warn: noop, error: noop }))
      .use(integrationEvents.incomingRoutes)

    const response = await app.handle(eventRequest(event))

    expect(response.status).toBe(202)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledWith(event.data.userId)
  })
})
