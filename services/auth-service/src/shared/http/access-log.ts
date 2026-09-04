import { Elysia } from 'elysia'
import type { Logger } from '@/shared/lib/logger/logger'

const startedAt = new WeakMap<Request, number>()

/**
 * Одна строка лога на запрос: метод, путь, статус, длительность.
 * `{ as: 'global' }` — иначе хуки применились бы только к роутам этого
 * плагина (у него их нет), а не ко всем модулям, подключённым после него.
 */
export const createAccessLog = (logger: Logger) =>
  new Elysia({ name: 'access-log' })
    .onRequest(({ request }) => {
      startedAt.set(request, performance.now())
    })
    .onAfterResponse({ as: 'global' }, ({ request, path, set }) => {
      const start = startedAt.get(request)
      startedAt.delete(request)

      const status = set.status ?? 200
      const durationMs = start ? Math.round(performance.now() - start) : undefined

      logger.info(`${request.method} ${path} ${status}`, {
        method: request.method,
        path,
        status,
        durationMs,
      })
    })
