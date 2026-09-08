import { describe, expect, mock, test } from 'bun:test'
import { Elysia, t } from 'elysia'
import {
  ACCOUNT_CREATED_V1,
  accountCreatedV1Example,
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import { Value } from '@sinclair/typebox/value'
import { createIntegrationEventsRoutes } from '@/modules/integration-events/incoming/http/integration-events.routes'
import { createReceiveIntegrationEvent } from '@/modules/integration-events/incoming/receive-integration-event'
import { onAccountCreated } from '@/modules/user-profile/events/on-account-created'
import type {
  UserTransactionRepositories,
  UserUnitOfWork,
} from '@/shared/database/user-unit-of-work'
import { createErrorHandler } from '@/shared/http/error-handler'

const token = 'test-consumer-token'
const event: AccountCreatedV1 = accountCreatedV1Example

const repositories = (reserve: UserTransactionRepositories['inbox']['reserve']) => {
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

const receiver = (unitOfWork: UserUnitOfWork) => createReceiveIntegrationEvent({
  unitOfWork,
  handleEvent: onAccountCreated,
})

describe('account-created integration event', () => {
  test('producer example conforms to the consumer runtime schema', () => {
    const runtimeSchema = t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema)
    expect(Value.Check(runtimeSchema, event)).toBe(true)
    expect(Value.Check(runtimeSchema, { ...event, extra: true })).toBe(false)
  })

  test('creates a profile only for the first delivery', async () => {
    const reserve = mock(async () => true)
    reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const context = repositories(reserve)
    const receive = receiver(context.unitOfWork)

    await expect(receive(event)).resolves.toBe(true)
    await expect(receive(event)).resolves.toBe(false)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledTimes(1)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledWith(event.data.userId)
  })

  test('lets a handler failure roll back the surrounding inbox transaction', async () => {
    const context = repositories(mock(async () => true))
    context.userProfiles.createIfAbsent = mock(async () => { throw new Error('profile failed') })
    await expect(receiver(context.unitOfWork)(event)).rejects.toThrow('profile failed')
    expect(context.unitOfWork.run).toHaveBeenCalledTimes(1)
  })

  test('protects the internal endpoint and acknowledges after receive completes', async () => {
    const receiveIntegrationEvent = mock(async () => true)
    const noop = () => {}
    const app = new Elysia()
      .use(createErrorHandler({ debug: noop, info: noop, warn: noop, error: noop }))
      .use(createIntegrationEventsRoutes({ consumerToken: token, receiveIntegrationEvent }))

    const unauthorized = await app.handle(new Request('http://service/internal/events', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event),
    }))
    expect(unauthorized.status).toBe(401)

    const accepted = await app.handle(new Request('http://service/internal/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ accepted: true, duplicate: false })
    expect(receiveIntegrationEvent).toHaveBeenCalledWith(event)
  })
})
