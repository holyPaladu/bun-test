import type { OutgoingIntegrationEvent } from '../types/integration-event.type'
import { EventDeliveryError } from '../errors/event-delivery.error'

export interface SendEventHttpOptions {
  url: string
  token: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

export type SendEvent = (event: OutgoingIntegrationEvent) => Promise<void>

/** Один HTTP-запрос. 408, 429 и 5xx повторяются; остальные 4xx уходят в DLQ. */
export const createHttpEventSender = (options: SendEventHttpOptions): SendEvent => {
  const request = options.fetch ?? globalThis.fetch

  return async event => {
    const response = await request(options.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(options.timeoutMs),
    })

    if (!response.ok) {
      const retryable = response.status === 408
        || response.status === 429
        || response.status >= 500
      throw new EventDeliveryError(
        `Consumer responded with HTTP ${response.status}`,
        retryable,
      )
    }
  }
}
