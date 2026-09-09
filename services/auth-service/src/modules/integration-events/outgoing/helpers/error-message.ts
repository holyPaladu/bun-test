/** Bounds error text stored in the outbox and written to delivery logs. */
export const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
