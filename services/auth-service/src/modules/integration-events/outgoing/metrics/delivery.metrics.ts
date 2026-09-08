import type { PrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'
import { prometheusLabel } from '@/shared/http/routes/metrics/prometheus.registry'

export type DeliveryOutcome = 'published' | 'retry' | 'dead_letter'

export interface RecordDeliveryAttemptInput {
  eventType: string
  outcome: DeliveryOutcome
  durationSeconds: number
  occurredAt: Date
  completedAt: Date
}

export interface DeliveryMetrics {
  recordAttempt(input: RecordDeliveryAttemptInput): void
}

const key = (eventType: string, outcome: DeliveryOutcome) => `${eventType}\u0000${outcome}`

export const createDeliveryMetrics = (
  registry: PrometheusRegistry,
  namespace: string,
): DeliveryMetrics => {
  const attempts = new Map<string, number>()
  const durations = new Map<string, { count: number; sum: number }>()
  const successDelay = new Map<string, { count: number; sum: number }>()

  registry.register(`${namespace}_outbox_delivery`, () => {
    const lines = [
      `# HELP ${namespace}_outbox_delivery_attempts_total Delivery attempts by event type and outcome.`,
      `# TYPE ${namespace}_outbox_delivery_attempts_total counter`,
    ]
    for (const [mapKey, value] of attempts) {
      const [eventType, outcome] = mapKey.split('\u0000')
      lines.push(`${namespace}_outbox_delivery_attempts_total{event_type="${prometheusLabel(eventType!)}",outcome="${outcome}"} ${value}`)
    }

    lines.push(
      `# HELP ${namespace}_outbox_delivery_request_duration_seconds Time spent sending an event.`,
      `# TYPE ${namespace}_outbox_delivery_request_duration_seconds summary`,
    )
    for (const [eventType, value] of durations) {
      const label = `event_type="${prometheusLabel(eventType)}"`
      lines.push(`${namespace}_outbox_delivery_request_duration_seconds_sum{${label}} ${value.sum}`)
      lines.push(`${namespace}_outbox_delivery_request_duration_seconds_count{${label}} ${value.count}`)
    }

    lines.push(
      `# HELP ${namespace}_outbox_delivery_success_delay_seconds Time from event occurrence to successful delivery.`,
      `# TYPE ${namespace}_outbox_delivery_success_delay_seconds summary`,
    )
    for (const [eventType, value] of successDelay) {
      const label = `event_type="${prometheusLabel(eventType)}"`
      lines.push(`${namespace}_outbox_delivery_success_delay_seconds_sum{${label}} ${value.sum}`)
      lines.push(`${namespace}_outbox_delivery_success_delay_seconds_count{${label}} ${value.count}`)
    }
    return lines
  })

  return {
    recordAttempt: input => {
      const attemptKey = key(input.eventType, input.outcome)
      attempts.set(attemptKey, (attempts.get(attemptKey) ?? 0) + 1)

      const duration = durations.get(input.eventType) ?? { count: 0, sum: 0 }
      duration.count += 1
      duration.sum += Math.max(0, input.durationSeconds)
      durations.set(input.eventType, duration)

      if (input.outcome === 'published') {
        const delay = successDelay.get(input.eventType) ?? { count: 0, sum: 0 }
        delay.count += 1
        delay.sum += Math.max(0, (input.completedAt.getTime() - input.occurredAt.getTime()) / 1_000)
        successDelay.set(input.eventType, delay)
      }
    },
  }
}
