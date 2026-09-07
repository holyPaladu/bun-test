/** Применяет SQL-миграции по имени, каждую в отдельной транзакции. */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEnv } from '@/shared/config/env'
import { createDatabaseClient } from '@/shared/database/client'

const migrationsDir = join(import.meta.dir, '..', 'migrations')
const sql = createDatabaseClient(loadEnv())

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text        PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`

const applied = new Set(
  (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map(row => row.name),
)
const files = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort()

for (const name of files.filter(name => !applied.has(name))) {
  const statements = await Bun.file(join(migrationsDir, name)).text()

  await sql.begin(async transaction => {
    await transaction.unsafe(statements)
    await transaction`INSERT INTO schema_migrations (name) VALUES (${name})`
  })

  console.log(`Applied ${name}`)
}

await sql.close()
