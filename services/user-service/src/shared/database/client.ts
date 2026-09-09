import { SQL } from 'bun'
import type { DatabaseEnv } from '@/shared/config/env'

export type DatabaseClient = SQL

export const createDatabaseClient = (env: DatabaseEnv): DatabaseClient =>
  new SQL(env.DATABASE_URL)
