import { describe, expect, mock, test } from 'bun:test'
import { createDeliverEventUseCase, type DeliverEventDeps } from '@/modules/integration-events/outgoing/use-cases/deliver-event'
import { EventDeliveryError } from '@/modules/integration-events/outgoing/errors/event-delivery.error'
import { createDeliveryMetrics } from '@/modules/integration-events/outgoing/metrics/delivery.metrics'
import { createPrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'
import { claimedEvent, event, silentLogger } from '../helpers/outgoing-events'

const now = new Date('2026-09-09T10:00:00.000Z')
const setup = (overrides: Partial<DeliverEventDeps> = {}) => {
  const outbox = {
    markPublished: mock(async () => true),
    markFailed: mock(async () => true),
    markDeadLettered: mock(async () => true),
  }
  const metrics = { recordAttempt: mock(() => {}) }
  const sendEvent = mock(async () => {})
  const logger = { warn: mock(silentLogger.warn), error: mock(silentLogger.error) }
  const deps: DeliverEventDeps = {
    outbox, sendEvent, metrics, logger,
    now: () => now,
    random: () => 0.5,
    options: { maxAttempts: 3, baseRetryMs: 100, maxRetryMs: 1_000 },
    ...overrides,
  }
  return { outbox, metrics, sendEvent, logger, deliverEvent: createDeliverEventUseCase(deps) }
}

describe('deliverEvent', () => {
  test('publishes using the current lease owner before recording metrics', async () => {
    const context = setup({ metrics: { recordAttempt: () => {
      expect(context.outbox.markPublished).toHaveBeenCalledTimes(1)
    } } })
    await context.deliverEvent(claimedEvent())
    expect(context.sendEvent).toHaveBeenCalledWith(event)
    expect(context.outbox.markPublished).toHaveBeenCalledWith({
      eventId: event.eventId, leaseOwner: 'publisher-a',
    })
    expect(context.outbox.markFailed).not.toHaveBeenCalled()
    expect(context.outbox.markDeadLettered).not.toHaveBeenCalled()
  })

  test('schedules exponential retry for a transient error', async () => {
    const context = setup({ sendEvent: async () => { throw new Error('network down') } })
    await context.deliverEvent(claimedEvent(2))
    expect(context.outbox.markFailed).toHaveBeenCalledWith({
      eventId: event.eventId, leaseOwner: 'publisher-a', error: 'network down',
      nextAttemptAt: new Date(now.getTime() + 200),
    })
    expect(context.outbox.markPublished).not.toHaveBeenCalled()
    expect(context.outbox.markDeadLettered).not.toHaveBeenCalled()
    expect(context.metrics.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'retry' }))
  })

  test.each([
    [1, false, 'permanent error'],
    [3, true, 'last retry'],
  ] as const)('dead-letters attempt %i with retryable=%s', async (attempt, retryable, message) => {
    const context = setup({ sendEvent: async () => { throw new EventDeliveryError(message, retryable) } })
    await context.deliverEvent(claimedEvent(attempt))
    expect(context.outbox.markDeadLettered).toHaveBeenCalledWith({
      eventId: event.eventId, leaseOwner: 'publisher-a', error: message,
    })
    expect(context.outbox.markPublished).not.toHaveBeenCalled()
    expect(context.outbox.markFailed).not.toHaveBeenCalled()
    expect(context.metrics.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'dead_letter' }))
  })

  test.each(['published', 'retry', 'dead_letter'] as const)(
    'does not record %s metrics when the lease rejects the update', async outcome => {
      const registry = createPrometheusRegistry()
      const context = setup({
        outbox: {
          markPublished: async () => false,
          markFailed: async () => false,
          markDeadLettered: async () => false,
        },
        metrics: createDeliveryMetrics(registry, 'test'),
        sendEvent: async () => {
          if (outcome !== 'published') throw new EventDeliveryError('failure', outcome === 'retry')
        },
      })
      await context.deliverEvent(claimedEvent())
      expect(await registry.render()).not.toContain('event_type=')
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Ignored outbox result from stale lease owner', expect.objectContaining({ eventId: event.eventId }),
      )
    },
  )

  test('a metrics failure does not change a successful delivery decision', async () => {
    const context = setup({ metrics: { recordAttempt: () => { throw new Error('metrics unavailable') } } })
    await expect(context.deliverEvent(claimedEvent())).resolves.toBeUndefined()
    expect(context.outbox.markPublished).toHaveBeenCalledTimes(1)
    expect(context.outbox.markFailed).not.toHaveBeenCalled()
    expect(context.outbox.markDeadLettered).not.toHaveBeenCalled()
    expect(context.logger.warn).toHaveBeenCalledWith(
      'Failed to record outbox delivery metrics', { error: 'metrics unavailable' },
    )
  })

  test('a published-state write failure is not reclassified as a delivery failure', async () => {
    const context = setup()
    context.outbox.markPublished.mockImplementation(async () => { throw new Error('database unavailable') })
    await expect(context.deliverEvent(claimedEvent())).rejects.toThrow('database unavailable')
    expect(context.outbox.markFailed).not.toHaveBeenCalled()
    expect(context.outbox.markDeadLettered).not.toHaveBeenCalled()
    expect(context.metrics.recordAttempt).not.toHaveBeenCalled()
  })
})
