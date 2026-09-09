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

export const isRetryableDeliveryError = (error: unknown): boolean =>
  !(error instanceof EventDeliveryError) || error.retryable
