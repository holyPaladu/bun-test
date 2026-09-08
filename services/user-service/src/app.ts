import { Elysia } from 'elysia'
import type { Container } from '@/container'
import { createAccessLog } from '@/shared/http/access-log'
import { createErrorHandler } from '@/shared/http/error-handler'
import { healthRoute } from '@/shared/http/routes/health/health.route'
import { openapiPlugin } from '@/shared/http/openapi'
import { successEnvelope } from '@/shared/http/success-envelope'
import {
  createUserProfileModule,
} from '@/modules/user-profile/user-profile.module'
import { onAccountCreated } from '@/modules/user-profile/events/on-account-created'
import { createIntegrationEventsModule } from '@/modules/integration-events/integration-events.module'

/**
 * Сборка HTTP-приложения из модулей: бизнес-роуты живут под /api, служебные — нет.
 * Служебные роуты (health/openapi) обязаны быть объявлены ДО .group('/api', ...) —
 * successEnvelope внутри группы scoped-хуком подхватывает и всё, что идёт в
 * родителе после точки подключения (см. success-envelope.ts).
 */
export const createApp = (container: Container) => {
  const integrationEvents = createIntegrationEventsModule(
    container,
    onAccountCreated,
  )

  return new Elysia()
    .use(createErrorHandler(container.logger))
    .use(createAccessLog(container.logger))
    .use(openapiPlugin)
    .use(healthRoute(container.sql))
    .use(integrationEvents.incomingRoutes)
    .group('/api', app => app
      .use(successEnvelope)
      .use(createUserProfileModule(container))
    )
}

export type App = ReturnType<typeof createApp>
