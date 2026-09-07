import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type { AccountCreatedEvent } from '@/modules/integration-events/events'
import { IntegrationEventsRoutes } from '@/modules/integration-events/integration-events.routes'
import type { InboxRepository } from '@/modules/integration-events/inbox.repository'
import { ProcessIntegrationEventUseCase } from '@/modules/integration-events/process-integration-event'
import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import type { UserUnitOfWork } from '@/shared/database/user-unit-of-work'
import { createErrorHandler } from '@/shared/http/error-handler'

const token = 'test-consumer-token'
const event: AccountCreatedEvent = {
  eventId: '4c203a1c-d810-47ba-9e44-7d881a526ee2',
  type: 'auth.account-created.v1',
  occurredAt: '2026-09-07T10:00:00.000Z',
  data: { userId: '550e8400-e29b-41d4-a716-446655440000' },
}

const repositories = (reserve: InboxRepository['reserve']) => {
  const inbox: InboxRepository = { reserve }
  const userProfiles: UserProfileRepository = {
    createIfAbsent: mock(async () => {}),
    findById: mock(async () => null),
    update: mock(async () => null),
  }
  const unitOfWork: UserUnitOfWork = {
    run: mock(async work => work({ inbox, userProfiles })),
  }
  return { inbox, userProfiles, unitOfWork }
}

describe('account-created integration event', () => {
  test('creates a profile only for the first delivery', async () => {
    const reserve = mock(async () => true)
    reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const context = repositories(reserve)
    const process = ProcessIntegrationEventUseCase({ unitOfWork: context.unitOfWork })

    await expect(process(event)).resolves.toBe(true)
    await expect(process(event)).resolves.toBe(false)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledTimes(1)
    expect(context.userProfiles.createIfAbsent).toHaveBeenCalledWith(event.data.userId)
  })

  test('protects the internal endpoint and accepts a valid event', async () => {
    const processIntegrationEvent = mock(async () => true)
    const noop = () => {}
    const app = new Elysia()
      .use(createErrorHandler({ debug: noop, info: noop, warn: noop, error: noop }))
      .use(IntegrationEventsRoutes({ consumerToken: token, processIntegrationEvent }))

    const unauthorized = await app.handle(new Request('http://service/internal/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }))
    expect(unauthorized.status).toBe(401)

    const accepted = await app.handle(new Request('http://service/internal/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    }))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ accepted: true, duplicate: false })
    expect(processIntegrationEvent).toHaveBeenCalledWith(event)
  })
})
