export interface OutboxWorkerCommand {
  type: 'deliver-pending-events'
  requestId: string
}

export interface DeliveryAttemptObservation {
  eventType: string
  outcome: 'published' | 'retry' | 'dead_letter'
  durationSeconds: number
  occurredAt: string
  completedAt: string
}

export type OutboxWorkerResult = {
  type: 'completed'
  requestId: string
} | {
  type: 'failed'
  requestId: string
  error: string
} | {
  type: 'delivery-attempt'
  requestId: string
  observation: DeliveryAttemptObservation
}

export const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
