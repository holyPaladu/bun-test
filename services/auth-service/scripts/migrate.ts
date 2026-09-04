/**
 * Минимальный раннер миграций: применяет неприменённые .sql из migrations/
 * по возрастанию имени, каждую в отдельной транзакции.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEnv } from '@/shared/config/env'
import { createDatabaseClient } from '@/shared/database/client'

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations')

const env = loadEnv()
const sql = createDatabaseClient(env)

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text        PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`

const applied = new Set(
  (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map(row => row.name),
)

const files = (await readdir(MIGRATIONS_DIR))
  .filter(name => name.endsWith('.sql'))
  .sort()

const pending = files.filter(name => !applied.has(name))

if (pending.length === 0) {
  console.log(`No pending migrations (${files.length} already applied)`)
} else {
  for (const name of pending) {
    const statements = await Bun.file(join(MIGRATIONS_DIR, name)).text()

    await sql.begin(async tx => {
      await tx.unsafe(statements)
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`
    })

    console.log(`Applied ${name}`)
  }
}

await sql.close()
