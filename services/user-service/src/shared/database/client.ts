import { SQL } from 'bun'
import type { Env } from '@/shared/config/env'

export type DatabaseClient = SQL

export const createDatabaseClient = (env: Env): DatabaseClient =>
  new SQL(env.DATABASE_URL)
