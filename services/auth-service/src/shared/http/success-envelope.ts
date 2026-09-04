import { Elysia, ElysiaCustomStatusResponse } from 'elysia'

/**
 * Оборачивает успешные бизнес-ответы в { success: true, data }.
 *
 * `mapResponse`, а не `afterHandle` — тот идёт ДО валидации по `response:`
 * схеме роута, и обёртка сломала бы её (каждый роут пришлось бы объявлять
 * уже обёрнутым). `mapResponse` — после валидации, трогает только то, что
 * реально уходит по проводу; схемы роутов остаются как есть.
 *
 * Ошибки не оборачиваются: error-handler уже отдал { error: {...} } с нужным
 * статусом, различаем по set.status >= 400 (mapResponse видит его даже для
 * ответов из onError — сам по себе он их не пропускает).
 *
 * `{ as: 'scoped' }` — вешается только на /api группу (см. app.ts). Здесь же
 * и ловушка: scoped-хук подхватывает и всё, что зарегистрировано в родителе
 * ПОСЛЕ точки, где подключён этот плагин. Поэтому health/jwks/openapi в
 * app.ts должны оставаться объявлены ДО .group('/api', ...), а не после.
 */
export const successEnvelope = new Elysia({ name: 'success-envelope' })
  .mapResponse({ as: 'scoped' }, ({ response, set }) => {
    const status = typeof set.status === 'number' ? set.status : 200
    if (status >= 400) return

    if (
      response == null ||
      typeof response !== 'object' ||
      response instanceof Response ||
      response instanceof ElysiaCustomStatusResponse
    ) return

    return new Response(JSON.stringify({ success: true, data: response }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
