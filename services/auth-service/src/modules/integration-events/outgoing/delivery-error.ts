/** Error returned by a transport that knows whether the request may be retried. */
export class EventDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'EventDeliveryError'
  }
}

export const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)

export const isRetryableDeliveryError = (error: unknown): boolean =>
  !(error instanceof EventDeliveryError) || error.retryable
