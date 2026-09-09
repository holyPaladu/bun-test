import { expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type { Container } from '@/container'
import { createIntegrationEventsModule } from '@/modules/integration-events/integration-events.module'
import { createOutboxRepository } from '@/modules/integration-events/outgoing/repo/outbox.repository'
import { createPrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'
import { createInMemoryDatabase } from '../helpers/in-memory-database'
import { event, silentLogger } from '../helpers/outgoing-events'

test('assembles cron, delivery and metrics once and exposes manual replay', async () => {
  const received: unknown[] = []
  const consumer = Bun.serve({
    port: 0,
    fetch: async request => {
      expect(request.headers.get('authorization')).toBe('Bearer test-token')
      received.push(await request.json())
      return new Response(null, { status: 204 })
    },
  })
  const database = createInMemoryDatabase()
  const registry = createPrometheusRegistry()
  const register = mock(registry.register)
  const env: Container['env'] = {
    NODE_ENV: 'test', PORT: 0, DATABASE_URL: 'memory://auth',
    JWT_PRIVATE_KEY: 'unused', JWT_PUBLIC_KEY: 'unused', JWT_KID: 'test',
    JWT_ISSUER: 'test', JWT_AUDIENCE: 'test', JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_TTL_DAYS: 30, SESSION_ABSOLUTE_TTL_DAYS: 90,
    USER_EVENTS_URL: new URL('/internal/events', consumer.url).href,
    EVENT_DELIVERY_TOKEN: 'test-token',
    OUTBOX_CRON_PATTERN: '0 0 1 1 *', OUTBOX_CRON_TIMEZONE: 'UTC', LOG_LEVEL: 'error',
  }
  let stopApp: (() => Promise<unknown>) | undefined
  try {
    const integrationEvents = createIntegrationEventsModule({
      sql: database.sql, logger: silentLogger, env,
      metricsRegistry: { ...registry, register },
    })
    expect(Object.keys(integrationEvents).sort()).toEqual(['metricsRoutes', 'outboxCron', 'replayDeadLettered'])
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]![0]).toBe('auth_outbox_delivery')
    expect(integrationEvents.replayDeadLettered).toBeFunction()
    expect(integrationEvents.outboxCron.store.cron.outboxDelivery.isRunning()).toBe(false)
    const app = new Elysia().use(integrationEvents.outboxCron).use(integrationEvents.metricsRoutes).listen(0)
    stopApp = () => app.stop()
    await createOutboxRepository(database.sql).append(event, event.data.userId)
    await integrationEvents.outboxCron.store.cron.outboxDelivery.trigger()
    expect(received).toEqual([event])
    expect(database.outboxEvents[0]!.published_at).toBeInstanceOf(Date)
    expect(database.outboxEvents[0]!.lease_owner).toBeNull()
    const response = await app.handle(new Request('http://localhost/metrics'))
    expect(response.status).toBe(200)
    const metrics = await response.text()
    expect(metrics).toContain('auth_outbox_pending_events 0')
    expect(metrics).toContain('outcome="published"} 1')
    expect(register).toHaveBeenCalledTimes(1)
  } finally {
    await stopApp?.()
    await consumer.stop(true)
  }
})
