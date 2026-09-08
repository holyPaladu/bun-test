import { describe, expect, mock, test } from 'bun:test'
import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import { createDeliverPendingEvents } from '@/modules/integration-events/outgoing/deliver-pending-events'
import { EventDeliveryHttpError } from '@/modules/integration-events/outgoing/http/send-event.http'
import { createDeliveryMetrics } from '@/modules/integration-events/outgoing/metrics/delivery.metrics'
import { createOutboxWorker } from '@/modules/integration-events/outgoing/outbox.worker'
import type { OutboxRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import { createPostgresOutboxRepository } from '@/modules/integration-events/outgoing/repo/postgres-outbox.repository'
import { createPrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'
import type { Logger } from '@/shared/lib/logger/logger'
import { createInMemoryDatabase } from '../helpers/in-memory-database'

const event: AccountCreatedV1 = {
  eventId: '4c203a1c-d810-47ba-9e44-7d881a526ee2',
  type: 'auth.account-created.v1',
  occurredAt: '2026-09-07T10:00:00.000Z',
  data: { userId: '550e8400-e29b-41d4-a716-446655440000' },
}

const logger: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const repository = (attemptCount = 1): OutboxRepository => ({
  append: mock(async () => {}),
  claimDue: mock(async input => [{
    id: event.eventId,
    event,
    occurredAt: new Date(event.occurredAt),
    attemptCount,
    leaseOwner: input.leaseOwner,
  }]),
  markPublished: mock(async () => true),
  markFailed: mock(async () => true),
  markDeadLettered: mock(async () => true),
  replayDeadLettered: mock(async () => true),
  getStats: mock(async () => ({ pending: 0, deadLettered: 0, oldestPendingAgeSeconds: 0 })),
})

const deliver = (
  outbox: OutboxRepository,
  sendEvent: (event: AccountCreatedV1) => Promise<void>,
  attemptCount = 1,
) => createDeliverPendingEvents({
  outbox,
  sendEvent,
  metrics: createDeliveryMetrics(createPrometheusRegistry(), 'test'),
  logger,
  random: () => 0.5,
  options: {
    workerId: 'worker-a', batchSize: 10, leaseMs: 30_000,
    maxAttempts: 3, baseRetryMs: 100, maxRetryMs: 1_000,
  },
})

describe('deliverPendingEvents', () => {
  test('publishes using the current lease owner', async () => {
    const outbox = repository()
    const sendEvent = mock(async () => {})
    await deliver(outbox, sendEvent)()
    expect(sendEvent).toHaveBeenCalledWith(event)
    expect(outbox.markPublished).toHaveBeenCalledWith({
      eventId: event.eventId,
      leaseOwner: 'worker-a',
    })
  })

  test('schedules jittered exponential retry for a transient error', async () => {
    const outbox = repository(2)
    const before = Date.now()
    await deliver(outbox, mock(async () => { throw new Error('network down') }))()
    const input = (outbox.markFailed as ReturnType<typeof mock>).mock.calls[0]![0]
    expect(input.error).toBe('network down')
    expect(input.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 200)
    expect(outbox.markDeadLettered).not.toHaveBeenCalled()
  })

  test('dead-letters permanent HTTP errors without exhausting retries', async () => {
    const outbox = repository(1)
    await deliver(outbox, mock(async () => { throw new EventDeliveryHttpError(422, false) }))()
    expect(outbox.markDeadLettered).toHaveBeenCalledWith({
      eventId: event.eventId,
      leaseOwner: 'worker-a',
      error: 'Consumer responded with HTTP 422',
    })
  })

  test('does not record an outcome when a stale lease rejects the update', async () => {
    const outbox = repository()
    outbox.markPublished = mock(async () => false)
    const registry = createPrometheusRegistry()
    const metrics = createDeliveryMetrics(registry, 'test')
    const run = createDeliverPendingEvents({
      outbox, sendEvent: mock(async () => {}), metrics, logger,
      options: {
        workerId: 'stale-worker', batchSize: 1, leaseMs: 30_000,
        maxAttempts: 3, baseRetryMs: 100, maxRetryMs: 1_000,
      },
    })
    await run()
    expect(await registry.render()).not.toContain('event_type=')
  })

  test('a metrics failure does not change a successful delivery decision', async () => {
    const outbox = repository()
    const run = createDeliverPendingEvents({
      outbox,
      sendEvent: mock(async () => {}),
      metrics: { recordAttempt: () => { throw new Error('metrics unavailable') } },
      logger,
      options: {
        workerId: 'worker-a', batchSize: 1, leaseMs: 30_000,
        maxAttempts: 3, baseRetryMs: 100, maxRetryMs: 1_000,
      },
    })
    await expect(run()).resolves.toBeUndefined()
    expect(outbox.markPublished).toHaveBeenCalledTimes(1)
    expect(outbox.markFailed).not.toHaveBeenCalled()
  })

  test('a published-state write failure is not reclassified as a delivery failure', async () => {
    const outbox = repository()
    outbox.markPublished = mock(async () => { throw new Error('database unavailable') })
    await expect(deliver(outbox, mock(async () => {}))()).rejects.toThrow('database unavailable')
    expect(outbox.markFailed).not.toHaveBeenCalled()
    expect(outbox.markDeadLettered).not.toHaveBeenCalled()
  })
})

describe('outbox lease ownership', () => {
  test('an expired owner cannot overwrite the result of a new claim', async () => {
    const database = createInMemoryDatabase()
    const outbox = createPostgresOutboxRepository(database.sql)
    await outbox.append(event, event.data.userId)

    const [staleClaim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'a' })
    database.outboxEvents[0]!.locked_until = new Date(0)
    const [currentClaim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'b' })

    await expect(outbox.markPublished({
      eventId: staleClaim!.id,
      leaseOwner: staleClaim!.leaseOwner,
    })).resolves.toBe(false)
    await expect(outbox.markPublished({
      eventId: currentClaim!.id,
      leaseOwner: currentClaim!.leaseOwner,
    })).resolves.toBe(true)
  })
})

describe('delivery metrics', () => {
  test('exports attempts, request duration, and successful delivery delay', async () => {
    const registry = createPrometheusRegistry()
    const metrics = createDeliveryMetrics(registry, 'auth')
    metrics.recordAttempt({
      eventType: event.type,
      outcome: 'published',
      durationSeconds: 0.25,
      occurredAt: new Date('2026-09-07T10:00:00.000Z'),
      completedAt: new Date('2026-09-07T10:00:02.000Z'),
    })
    const output = await registry.render()
    expect(output).toContain('auth_outbox_delivery_attempts_total')
    expect(output).toContain('outcome="published"} 1')
    expect(output).toContain('auth_outbox_delivery_request_duration_seconds_sum')
    expect(output).toContain('auth_outbox_delivery_success_delay_seconds_sum')
  })
})

describe('outbox worker', () => {
  test('start is idempotent, cycles do not overlap, and stop waits for the active cycle', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const run = mock(async () => gate)
    const worker = createOutboxWorker({ deliverPendingEvents: run, pollIntervalMs: 1, logger })

    worker.start()
    worker.start()
    await Bun.sleep(5)
    expect(run).toHaveBeenCalledTimes(1)

    let stopped = false
    const stopping = worker.stop().then(() => { stopped = true })
    await Bun.sleep(1)
    expect(stopped).toBe(false)
    release()
    await stopping
    expect(stopped).toBe(true)
  })
})
