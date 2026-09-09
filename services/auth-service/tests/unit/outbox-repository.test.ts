import { describe, expect, test } from 'bun:test'
import { createOutboxRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import { toClaimedOutboxEvent } from '@/modules/integration-events/outgoing/repo/outbox.mapper'
import { createInMemoryDatabase } from '../helpers/in-memory-database'
import { event } from '../helpers/outgoing-events'

describe('outbox lease ownership', () => {
  test('an expired owner cannot overwrite the result of a new claim', async () => {
    const database = createInMemoryDatabase()
    const outbox = createOutboxRepository(database.sql)
    await outbox.append(event, event.data.userId)
    const [staleClaim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'a' })
    database.outboxEvents[0]!.locked_until = new Date(0)
    const [currentClaim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'b' })
    await expect(outbox.markPublished({
      eventId: staleClaim!.eventId, leaseOwner: staleClaim!.leaseOwner,
    })).resolves.toBe(false)
    await expect(outbox.markPublished({
      eventId: currentClaim!.eventId, leaseOwner: currentClaim!.leaseOwner,
    })).resolves.toBe(true)
  })
})

describe('outbox mapper', () => {
  test.each([false, true])('maps a stored envelope with serialized=%s', serialized => {
    const mapped = toClaimedOutboxEvent({
      id: event.eventId,
      payload: serialized ? JSON.stringify(event) : event,
      occurred_at: serialized ? event.occurredAt : new Date(event.occurredAt),
      attempt_count: 2, lease_owner: 'publisher-a',
    })
    expect(mapped).toEqual({
      eventId: event.eventId, event, occurredAt: new Date(event.occurredAt),
      attemptCount: 2, leaseOwner: 'publisher-a',
    })
  })
})
