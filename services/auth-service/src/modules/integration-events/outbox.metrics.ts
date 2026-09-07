import type { OutboxStats } from '@/modules/integration-events/outbox.repository'

export type DeliveryOutcome = 'published' | 'retry' | 'dead_letter'

/** Счётчики процесса + persistent gauges очереди, которые читаются из БД. */
export class OutboxMetrics {
  private readonly deliveries: Record<DeliveryOutcome, number> = {
    published: 0,
    retry: 0,
    dead_letter: 0,
  }

  private lastDeliveryLagSeconds = 0

  record(outcome: DeliveryOutcome, occurredAt: Date): void {
    this.deliveries[outcome] += 1
    this.lastDeliveryLagSeconds = Math.max(0, (Date.now() - occurredAt.getTime()) / 1000)
  }

  render(stats: OutboxStats): string {
    return [
      '# HELP auth_outbox_deliveries_total Outbox delivery attempts by outcome.',
      '# TYPE auth_outbox_deliveries_total counter',
      ...Object.entries(this.deliveries).map(
        ([outcome, value]) => `auth_outbox_deliveries_total{outcome="${outcome}"} ${value}`,
      ),
      '# HELP auth_outbox_pending_events Events waiting for delivery.',
      '# TYPE auth_outbox_pending_events gauge',
      `auth_outbox_pending_events ${stats.pending}`,
      '# HELP auth_outbox_dead_letter_events Events abandoned after the retry limit.',
      '# TYPE auth_outbox_dead_letter_events gauge',
      `auth_outbox_dead_letter_events ${stats.deadLettered}`,
      '# HELP auth_outbox_oldest_pending_age_seconds Age of the oldest pending event.',
      '# TYPE auth_outbox_oldest_pending_age_seconds gauge',
      `auth_outbox_oldest_pending_age_seconds ${stats.oldestPendingAgeSeconds}`,
      '# HELP auth_outbox_last_delivery_lag_seconds Lag of the last attempted event.',
      '# TYPE auth_outbox_last_delivery_lag_seconds gauge',
      `auth_outbox_last_delivery_lag_seconds ${this.lastDeliveryLagSeconds}`,
      '',
    ].join('\n')
  }
}
