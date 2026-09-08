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
    const [stale] = await outbox.claimDue({ limit: 1, leaseMs: 10, leaseOwner: 'old' })
    await Bun.sleep(20)
    const [current] = await outbox.claimDue({ limit: 1, leaseMs: 1_000, leaseOwner: 'new' })

    await expect(outbox.markPublished({
      eventId: stale!.id, leaseOwner: stale!.leaseOwner,
    })).resolves.toBe(false)
    await expect(outbox.markPublished({
      eventId: current!.id, leaseOwner: current!.leaseOwner,
    })).resolves.toBe(true)
  })
})
