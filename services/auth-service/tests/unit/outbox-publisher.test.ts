import { describe, expect, mock, test } from 'bun:test'
import type { AccountCreatedEvent } from '@/modules/integration-events/events'
import { OutboxMetrics } from '@/modules/integration-events/outbox.metrics'
import { OutboxPublisher } from '@/modules/integration-events/outbox.publisher'
import type { OutboxRepository } from '@/modules/integration-events/outbox.repository'
import type { Logger } from '@/shared/lib/logger/logger'

const event: AccountCreatedEvent = {
  eventId: '4c203a1c-d810-47ba-9e44-7d881a526ee2',
  type: 'auth.account-created.v1',
  occurredAt: '2026-09-07T10:00:00.000Z',
  data: { userId: '550e8400-e29b-41d4-a716-446655440000' },
}

const logger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
}

const repository = (attemptCount: number): OutboxRepository => ({
  insert: mock(async () => {}),
  claimDue: mock(async () => [{
    id: event.eventId,
    event,
    occurredAt: new Date(event.occurredAt),
    attemptCount,
  }]),
  markPublished: mock(async () => {}),
  markFailed: mock(async () => {}),
  markDeadLettered: mock(async () => {}),
  stats: mock(async () => ({ pending: 0, deadLettered: 0, oldestPendingAgeSeconds: 0 })),
})

const publisher = (
  outbox: OutboxRepository,
  deliver: () => Promise<void>,
) => new OutboxPublisher({
  repository: outbox,
  transport: { deliver },
  metrics: new OutboxMetrics(),
  logger,
  options: {
    batchSize: 10,
    pollIntervalMs: 1000,
    leaseMs: 30000,
    maxAttempts: 3,
    baseRetryMs: 100,
    maxRetryMs: 1000,
  },
})

describe('OutboxPublisher', () => {
  test('marks a delivered event as published', async () => {
    const outbox = repository(1)
    const deliver = mock(async () => {})

    await publisher(outbox, deliver).runOnce()

    expect(deliver).toHaveBeenCalledWith(event)
    expect(outbox.markPublished).toHaveBeenCalledWith(event.eventId)
    expect(outbox.markFailed).not.toHaveBeenCalled()
  })

  test('schedules exponential retry below the attempt limit', async () => {
    const outbox = repository(2)
    const before = Date.now()

    await publisher(outbox, mock(async () => { throw new Error('network down') })).runOnce()

    expect(outbox.markFailed).toHaveBeenCalledTimes(1)
    const [, message, nextAttemptAt] = (outbox.markFailed as ReturnType<typeof mock>).mock.calls[0]
    expect(message).toBe('network down')
    expect((nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(before + 200)
    expect(outbox.markDeadLettered).not.toHaveBeenCalled()
  })

  test('moves an event to dead letter at the attempt limit', async () => {
    const outbox = repository(3)

    await publisher(outbox, mock(async () => { throw new Error('consumer rejected') })).runOnce()

    expect(outbox.markDeadLettered).toHaveBeenCalledWith(event.eventId, 'consumer rejected')
    expect(outbox.markFailed).not.toHaveBeenCalled()
  })
})
