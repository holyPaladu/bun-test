import { expect, test } from 'bun:test'
import { createDeliveryMetrics } from '@/modules/integration-events/outgoing/metrics/delivery.metrics'
import { createPrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'
import { event } from '../helpers/outgoing-events'

test('exports attempts, request duration, and successful delivery delay', async () => {
  const registry = createPrometheusRegistry()
  const metrics = createDeliveryMetrics(registry, 'auth')
  metrics.recordAttempt({
    eventType: event.type, outcome: 'published', durationSeconds: 0.25,
    occurredAt: new Date('2026-09-07T10:00:00.000Z'),
    completedAt: new Date('2026-09-07T10:00:02.000Z'),
  })
  const output = await registry.render()
  expect(output).toContain('auth_outbox_delivery_attempts_total')
  expect(output).toContain('outcome="published"} 1')
  expect(output).toContain(`auth_outbox_delivery_request_duration_seconds_sum{event_type="${event.type}"} 0.25`)
  expect(output).toContain(`auth_outbox_delivery_success_delay_seconds_sum{event_type="${event.type}"} 2`)
})
