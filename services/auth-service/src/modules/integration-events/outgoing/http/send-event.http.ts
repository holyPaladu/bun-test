import type { OutgoingIntegrationEvent } from '../repo/outbox.repository'

export interface SendEventHttpOptions {
  url: string
  token: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

export class EventDeliveryHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(`Consumer responded with HTTP ${status}`)
    this.name = 'EventDeliveryHttpError'
  }
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
      throw new EventDeliveryHttpError(response.status, retryable)
    }
  }
}
