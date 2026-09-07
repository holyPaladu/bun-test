import type { IntegrationEvent } from '@/modules/integration-events/events'
import type { OutboxRepository } from '@/modules/integration-events/outbox.repository'
import type { OutboxMetrics } from '@/modules/integration-events/outbox.metrics'
import type { Logger } from '@/shared/lib/logger/logger'

export interface EventDeliveryTransport {
  deliver(event: IntegrationEvent): Promise<void>
}

export interface OutboxPublisherOptions {
  batchSize: number
  pollIntervalMs: number
  leaseMs: number
  maxAttempts: number
  baseRetryMs: number
  maxRetryMs: number
}

interface OutboxPublisherDeps {
  repository: OutboxRepository
  transport: EventDeliveryTransport
  metrics: OutboxMetrics
  logger: Logger
  options: OutboxPublisherOptions
}

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)

export class OutboxPublisher {
  private active = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private currentRun: Promise<void> | undefined

  constructor(private readonly deps: OutboxPublisherDeps) {}

  start(): void {
    if (this.active) return
    this.active = true
    this.schedule(0)
  }

  async stop(): Promise<void> {
    this.active = false
    if (this.timer) clearTimeout(this.timer)
    await this.currentRun
  }

  async runOnce(): Promise<void> {
    const events = await this.deps.repository.claimDue(
      this.deps.options.batchSize,
      this.deps.options.leaseMs,
    )

    for (const claimed of events) {
      try {
        await this.deps.transport.deliver(claimed.event)
        await this.deps.repository.markPublished(claimed.id)
        this.deps.metrics.record('published', claimed.occurredAt)
      } catch (error) {
        const message = errorMessage(error)

        if (claimed.attemptCount >= this.deps.options.maxAttempts) {
          await this.deps.repository.markDeadLettered(claimed.id, message)
          this.deps.metrics.record('dead_letter', claimed.occurredAt)
          this.deps.logger.error('Outbox event moved to dead letter', {
            eventId: claimed.id,
            eventType: claimed.event.type,
            attempts: claimed.attemptCount,
            error: message,
          })
          continue
        }

        const delayMs = Math.min(
          this.deps.options.maxRetryMs,
          this.deps.options.baseRetryMs * 2 ** Math.max(0, claimed.attemptCount - 1),
        )
        await this.deps.repository.markFailed(
          claimed.id,
          message,
          new Date(Date.now() + delayMs),
        )
        this.deps.metrics.record('retry', claimed.occurredAt)
        this.deps.logger.warn('Outbox delivery failed; retry scheduled', {
          eventId: claimed.id,
          eventType: claimed.event.type,
          attempt: claimed.attemptCount,
          retryInMs: delayMs,
          error: message,
        })
      }
    }
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.currentRun = this.runOnce()
        .catch(error => this.deps.logger.error('Outbox poll failed', {
          error: errorMessage(error),
        }))
        .finally(() => {
          this.currentRun = undefined
          if (this.active) this.schedule(this.deps.options.pollIntervalMs)
        })
    }, delayMs)
  }
}

export const HttpEventDeliveryTransport = (options: {
  url: string
  token: string
  timeoutMs: number
}): EventDeliveryTransport => ({
  deliver: async event => {
    const response = await fetch(options.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(options.timeoutMs),
    })

    if (!response.ok) throw new Error(`Consumer responded with HTTP ${response.status}`)
  },
})
