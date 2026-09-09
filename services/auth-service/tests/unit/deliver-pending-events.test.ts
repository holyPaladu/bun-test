import { describe, expect, mock, test } from 'bun:test'
import { createDeliverPendingEventsUseCase } from '@/modules/integration-events/outgoing/use-cases/deliver-pending-events'
import { claimedEvent } from '../helpers/outgoing-events'

const options = { batchSize: 10, leaseMs: 30_000, publisherId: 'publisher-a' }

describe('deliverPendingEvents', () => {
  test('claims a batch and waits for all parallel attempts', async () => {
    const firstClaim = claimedEvent()
    const secondEvent = { ...firstClaim.event, eventId: crypto.randomUUID() }
    const events = [firstClaim, { ...claimedEvent(), eventId: secondEvent.eventId, event: secondEvent }]
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const claimDue = mock(async () => events)
    const deliverEvent = mock((event: typeof events[number]) => {
      if (event === events[0]) return first.promise
      started.resolve()
      return second.promise
    })
    let completed = false
    const run = createDeliverPendingEventsUseCase({ outbox: { claimDue }, deliverEvent, options })()
      .then(() => { completed = true })
    await started.promise
    expect(claimDue).toHaveBeenCalledWith({ limit: 10, leaseMs: 30_000, leaseOwner: 'publisher-a' })
    expect(deliverEvent).toHaveBeenCalledWith(events[0])
    expect(deliverEvent).toHaveBeenCalledWith(events[1])
    first.resolve()
    await first.promise
    expect(completed).toBe(false)
    second.resolve()
    await run
    expect(completed).toBe(true)
  })

  test('does not deliver anything for an empty batch', async () => {
    const deliverEvent = mock(async () => {})
    await createDeliverPendingEventsUseCase({
      outbox: { claimDue: async () => [] }, deliverEvent, options,
    })()
    expect(deliverEvent).not.toHaveBeenCalled()
  })

  test('propagates claim errors without starting delivery', async () => {
    const deliverEvent = mock(async () => {})
    await expect(createDeliverPendingEventsUseCase({
      outbox: { claimDue: async () => { throw new Error('claim failed') } }, deliverEvent, options,
    })()).rejects.toThrow('claim failed')
    expect(deliverEvent).not.toHaveBeenCalled()
  })

  test('propagates delivery persistence errors', async () => {
    await expect(createDeliverPendingEventsUseCase({
      outbox: { claimDue: async () => [claimedEvent()] }, options,
      deliverEvent: async () => { throw new Error('persist failed') },
    })()).rejects.toThrow('persist failed')
  })
})
