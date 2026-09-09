import { describe, expect, mock, test } from 'bun:test'
import { createOutboxCron } from '@/modules/integration-events/outgoing/cron/outbox.cron'
import { silentLogger } from '../helpers/outgoing-events'

describe('outbox cron', () => {
  test('is paused until app start, awaits the publisher, and stops with the app', async () => {
    const delivery = Promise.withResolvers<void>()
    const deliverPendingEvents = mock(() => delivery.promise)
    const app = createOutboxCron(silentLogger, {
      pattern: '0 0 1 1 *', timezone: 'UTC', deliverPendingEvents,
    })
    const job = app.store.cron.outboxDelivery
    expect(job.isRunning()).toBe(false)
    expect(deliverPendingEvents).not.toHaveBeenCalled()
    app.listen(0)
    try {
      expect(job.isRunning()).toBe(true)
      const run = job.trigger()
      expect(deliverPendingEvents).toHaveBeenCalledTimes(1)
      expect(job.isBusy()).toBe(true)
      delivery.resolve()
      await run
      expect(job.isBusy()).toBe(false)
    } finally {
      delivery.resolve()
      await app.stop()
    }
    expect(job.isStopped()).toBe(true)
  })

  test('protects a pending batch from overlapping scheduled runs', async () => {
    const started = Promise.withResolvers<void>()
    const delivery = Promise.withResolvers<void>()
    const deliverPendingEvents = mock(async () => {
      started.resolve()
      await delivery.promise
    })
    const app = createOutboxCron(silentLogger, {
      pattern: '* * * * * *', timezone: 'UTC', deliverPendingEvents,
    }).listen(0)
    try {
      await started.promise
      await Bun.sleep(1_100)
      expect(app.store.cron.outboxDelivery.isBusy()).toBe(true)
      expect(deliverPendingEvents).toHaveBeenCalledTimes(1)
    } finally {
      delivery.resolve()
      await app.stop()
    }
  })
})
