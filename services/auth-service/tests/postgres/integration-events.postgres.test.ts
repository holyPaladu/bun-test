import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { createAccountCreatedEvent } from '@/modules/auth/events/create-account-created.event'
import { createOutboxRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import { createAuthUnitOfWork } from '@/shared/database/auth-unit-of-work'

const databaseUrl = Bun.env.TEST_DATABASE_URL
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('PostgreSQL integration tests require a database name ending in _test')
}
const run = databaseUrl ? describe : describe.skip
let sql: SQL

run('integration events on PostgreSQL', () => {
  beforeAll(async () => {
    sql = new SQL(databaseUrl!)
    await sql`DROP TABLE IF EXISTS outbox_events`
    await sql`DROP TABLE IF EXISTS auth_accounts`
    await sql`
      CREATE TABLE auth_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        auth_status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `
    await sql`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY,
        event_type text NOT NULL,
        aggregate_id uuid NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        locked_until timestamptz,
        lease_owner text,
        published_at timestamptz,
        dead_lettered_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `
  })

  beforeEach(async () => {
    await sql`TRUNCATE outbox_events, auth_accounts`
  })

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS outbox_events`
    await sql`DROP TABLE IF EXISTS auth_accounts`
    await sql.close()
  })

  test('rolls back account and outbox together', async () => {
    const unitOfWork = createAuthUnitOfWork(sql)
    await expect(unitOfWork.run(async repositories => {
      const account = await repositories.authAccounts.insert({
        email: 'rollback@example.com', passwordHash: 'hash',
      })
      await repositories.outboxEvents.append(createAccountCreatedEvent(account.id), account.id)
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    const [{ accounts }] = await sql<{ accounts: string }[]>`
      SELECT count(*) AS accounts FROM auth_accounts
    `
    const [{ events }] = await sql<{ events: string }[]>`
      SELECT count(*) AS events FROM outbox_events
    `
    expect(Number(accounts)).toBe(0)
    expect(Number(events)).toBe(0)
  })

  test('rejects a state update from an expired lease owner', async () => {
    const outbox = createOutboxRepository(sql)
    const event = createAccountCreatedEvent('550e8400-e29b-41d4-a716-446655440000')
    await outbox.append(event, event.data.userId)
    const [stale] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'old' })
    await sql`UPDATE outbox_events SET locked_until = now() - interval '1 second' WHERE id = ${event.eventId}`

    await expect(outbox.markPublished({
      eventId: stale!.eventId, leaseOwner: stale!.leaseOwner,
    })).resolves.toBe(false)
    const [current] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'new' })
    expect(current!.attemptCount).toBe(2)
    const staleInput = { eventId: stale!.eventId, leaseOwner: stale!.leaseOwner }
    await expect(outbox.markPublished(staleInput)).resolves.toBe(false)
    await expect(outbox.markFailed({
      ...staleInput, error: 'stale retry', nextAttemptAt: new Date(),
    })).resolves.toBe(false)
    await expect(outbox.markDeadLettered({ ...staleInput, error: 'stale DLQ' })).resolves.toBe(false)
    await expect(outbox.markPublished({
      eventId: current!.eventId, leaseOwner: current!.leaseOwner,
    })).resolves.toBe(true)
  })

  test('concurrent publishers claim disjoint events exactly once', async () => {
    const outbox = createOutboxRepository(sql)
    const events = Array.from({ length: 4 }, () =>
      createAccountCreatedEvent('550e8400-e29b-41d4-a716-446655440000'))
    for (const event of events) await outbox.append(event, event.data.userId)
    const [first, second] = await Promise.all([
      outbox.claimDue({ limit: 2, leaseMs: 30_000, leaseOwner: 'first' }),
      outbox.claimDue({ limit: 2, leaseMs: 30_000, leaseOwner: 'second' }),
    ])
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(new Set([...first, ...second].map(claim => claim.eventId)).size).toBe(4)
    expect(first.every(claim => claim.leaseOwner === 'first' && claim.attemptCount === 1)).toBe(true)
    expect(second.every(claim => claim.leaseOwner === 'second' && claim.attemptCount === 1)).toBe(true)
    expect([...first, ...second].map(claim => claim.eventId).sort())
      .toEqual(events.map(event => event.eventId).sort())
  })

  test('maps PostgreSQL jsonb and timestamp to a claimed entity', async () => {
    const outbox = createOutboxRepository(sql)
    const event = createAccountCreatedEvent('550e8400-e29b-41d4-a716-446655440000')
    await outbox.append(event, event.data.userId)
    const [claim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'mapper' })
    expect(claim).toEqual({
      eventId: event.eventId, event, occurredAt: new Date(event.occurredAt),
      attemptCount: 1, leaseOwner: 'mapper',
    })
  })

  test('replay preserves the envelope and routing metadata and resets delivery state', async () => {
    const outbox = createOutboxRepository(sql)
    const event = createAccountCreatedEvent('550e8400-e29b-41d4-a716-446655440000')
    await outbox.append(event, event.data.userId)
    const [claim] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'publisher' })
    await outbox.markDeadLettered({
      eventId: claim!.eventId, leaseOwner: claim!.leaseOwner, error: 'permanent failure',
    })
    // Seed leftover lease state to verify replay clears it even after manual intervention.
    await sql`
      UPDATE outbox_events
      SET locked_until = now() + interval '1 hour', lease_owner = 'leftover',
          next_attempt_at = now() + interval '1 hour'
      WHERE id = ${event.eventId}
    `
    await expect(outbox.replayDeadLettered(event.eventId)).resolves.toBe(true)
    const [row] = await sql`
      SELECT id, payload, event_type, aggregate_id, occurred_at, attempt_count,
             locked_until, lease_owner, last_error, published_at, dead_lettered_at,
             next_attempt_at <= now() AS due
      FROM outbox_events WHERE id = ${event.eventId}
    `
    expect(row).toMatchObject({
      id: event.eventId, payload: event, event_type: event.type, aggregate_id: event.data.userId,
      occurred_at: new Date(event.occurredAt), attempt_count: 0, locked_until: null,
      lease_owner: null, last_error: null, published_at: null, dead_lettered_at: null, due: true,
    })
    await expect(outbox.replayDeadLettered(event.eventId)).resolves.toBe(false)
    const [replayed] = await outbox.claimDue({ limit: 1, leaseMs: 30_000, leaseOwner: 'replay' })
    expect(replayed!.event).toEqual(event)
    expect(replayed!.attemptCount).toBe(1)
  })
})
