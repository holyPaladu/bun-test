import { createApp } from '@/app'
import { createContainer } from '@/container'
import { createIntegrationEventsModule } from '@/modules/integration-events/integration-events.module'

const container = await createContainer()
const integrationEvents = createIntegrationEventsModule(container)
const app = createApp(container, integrationEvents).listen(container.env.PORT)

container.logger.info('Server started', {
  url: `http://${app.server?.hostname}:${app.server?.port}`,
  env: container.env.NODE_ENV,
})

const shutdown = async (signal: string) => {
  container.logger.info('Shutting down', { signal })

  await app.stop()
  await container.sql.close()

  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
