import { Elysia } from 'elysia'
import { healthSchemas } from './health.schema'
import { DatabaseClient } from '@/shared/database/client'

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
          200: 'check'
        },
      }
    )
    .get(
      '/db-ready',
      async () => {
        let isReady = false
        try {
          isReady = await sql`SELECT 1`
        } catch (error) {
          isReady = false
        }
        return { status: isReady ? 'ok' as const : 'not ready' as const }
      },
      {
        response: {
          200: 'dbReady'
        },
      }
    )
