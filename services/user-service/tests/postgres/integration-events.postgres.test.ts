import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { ACCOUNT_CREATED_V1, type AccountCreatedV1 } from '@test-project/integration-event-contracts'
import { createReceiveIntegrationEvent } from '@/modules/integration-events/incoming/receive-integration-event'
import { onAccountCreated } from '@/modules/user-profile/events/on-account-created'
import { createUserUnitOfWork } from '@/shared/database/user-unit-of-work'

const databaseUrl = Bun.env.TEST_DATABASE_URL
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('PostgreSQL integration tests require a database name ending in _test')
}
const run = databaseUrl ? describe : describe.skip
let sql: SQL
const event: AccountCreatedV1 = {
  eventId: '4c203a1c-d810-47ba-9e44-7d881a526ee2',
  type: ACCOUNT_CREATED_V1,
  occurredAt: '2026-09-07T10:00:00.000Z',
  data: { userId: '550e8400-e29b-41d4-a716-446655440000' },
}

run('incoming integration events on PostgreSQL', () => {
  beforeAll(async () => {
    sql = new SQL(databaseUrl!)
    await sql`DROP TABLE IF EXISTS event_inbox`
    await sql`DROP TABLE IF EXISTS user_profiles`
    await sql`
      CREATE TABLE user_profiles (
        user_id uuid PRIMARY KEY,
        display_name text,
        avatar_url text,
        locale text,
        timezone text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `
    await sql`
      CREATE TABLE event_inbox (
        event_id uuid PRIMARY KEY,
        event_type text NOT NULL,
        occurred_at timestamptz NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT now()
      )
    `
  })

  beforeEach(async () => {
    await sql`TRUNCATE event_inbox, user_profiles`
  })

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS event_inbox`
    await sql`DROP TABLE IF EXISTS user_profiles`
    await sql.close()
  })

  test('rolls back inbox when the business handler fails', async () => {
    const receive = createReceiveIntegrationEvent({
      unitOfWork: createUserUnitOfWork(sql),
      handleEvent: async (incoming, repositories) => {
        await repositories.userProfiles.createIfAbsent(incoming.data.userId)
        throw new Error('handler failed')
      },
    })
    await expect(receive(event)).rejects.toThrow('handler failed')

    const [{ inbox }] = await sql<{ inbox: string }[]>`SELECT count(*) AS inbox FROM event_inbox`
    const [{ profiles }] = await sql<{ profiles: string }[]>`
      SELECT count(*) AS profiles FROM user_profiles
    `
    expect(Number(inbox)).toBe(0)
    expect(Number(profiles)).toBe(0)
  })

  test('concurrent delivery applies the handler once', async () => {
    const receive = createReceiveIntegrationEvent({
      unitOfWork: createUserUnitOfWork(sql),
      handleEvent: onAccountCreated,
    })
    const results = await Promise.all([receive(event), receive(event)])
    expect(results.sort()).toEqual([false, true])

    const [{ profiles }] = await sql<{ profiles: string }[]>`
      SELECT count(*) AS profiles FROM user_profiles
    `
    expect(Number(profiles)).toBe(1)
  })
})
