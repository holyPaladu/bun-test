import { Elysia } from 'elysia'
import { healthSchemas } from './health.schema'
import type { DatabaseClient } from '@/shared/database/client'

/**
 * Технический эндпоинт, а не бизнес-модуль — поэтому лежит в shared/http
 */
export const healthRoute = (sql: DatabaseClient) =>
  new Elysia({ prefix: '/health', tags: ['system'] })
    .model(healthSchemas)
    .get(
      '/check',
      () => ({ status: 'ok' as const }),
      {
        response: {
          200: 'check',
        },
      },
    )
    .get(
      '/ready',
      async ({ set }) => {
        try {
          await sql`SELECT 1`
          return { status: 'ok' as const }
        } catch {
          set.status = 503
          return { status: 'not ready' as const }
        }
      },
      {
        response: {
          200: 'ready',
          503: 'notReady',
        },
      },
    )
