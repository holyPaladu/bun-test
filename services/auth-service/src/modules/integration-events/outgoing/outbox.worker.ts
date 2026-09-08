import type { Logger } from '@/shared/lib/logger/logger'

export interface OutboxWorkerDeps {
  deliverPendingEvents: () => Promise<void>
  pollIntervalMs: number
  logger: Logger
}

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)

/** Таймер и текущий цикл изолированы в замыкании экземпляра worker. */
export const createOutboxWorker = ({
  deliverPendingEvents,
  pollIntervalMs,
  logger,
}: OutboxWorkerDeps) => {
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let currentRun: Promise<void> | undefined

  const schedule = (delayMs: number): void => {
    timer = setTimeout(() => {
      currentRun = deliverPendingEvents()
        .catch(error => logger.error('Outbox poll failed', { error: errorMessage(error) }))
        .finally(() => {
          currentRun = undefined
          if (active) schedule(pollIntervalMs)
        })
    }, delayMs)
  }

  return {
    start: (): void => {
      if (active) return
      active = true
      schedule(0)
    },
    stop: async (): Promise<void> => {
      active = false
      if (timer) clearTimeout(timer)
      timer = undefined
      await currentRun
    },
  }
}

export type OutboxWorker = ReturnType<typeof createOutboxWorker>
