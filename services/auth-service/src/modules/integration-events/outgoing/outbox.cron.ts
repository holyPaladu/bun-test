import { cron } from '@elysia/cron'
import { Elysia } from 'elysia'
import type { Logger } from '@/shared/lib/logger/logger'
import type { RecordDeliveryAttemptInput } from './metrics/delivery.metrics'
import {
  errorMessage,
  type DeliveryAttemptObservation,
  type OutboxWorkerCommand,
  type OutboxWorkerResult,
} from './outbox-worker.messages'

export class OutboxWorkerTransportError extends Error {}

interface RequestWorkerRunOptions {
  timeoutMs: number
  recordAttempt(observation: RecordDeliveryAttemptInput): void
  requestId?: string
}

const fromObservation = (
  observation: DeliveryAttemptObservation,
): RecordDeliveryAttemptInput => ({
  ...observation,
  occurredAt: new Date(observation.occurredAt),
  completedAt: new Date(observation.completedAt),
})

/** Turns one worker command into a bounded request/response operation. */
export const requestWorkerRun = (
  worker: Worker,
  { timeoutMs, recordAttempt, requestId = crypto.randomUUID() }: RequestWorkerRunOptions,
): Promise<void> => new Promise((resolve, reject) => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const cleanup = () => {
    if (timeout) clearTimeout(timeout)
    worker.removeEventListener('message', onMessage)
    worker.removeEventListener('error', onError)
    worker.removeEventListener('close', onClose)
  }
  const succeed = () => {
    cleanup()
    resolve()
  }
  const fail = (error: Error) => {
    cleanup()
    reject(error)
  }
  const onMessage = (event: MessageEvent<OutboxWorkerResult>) => {
    const result = event.data
    if (!result || result.requestId !== requestId) return

    if (result.type === 'delivery-attempt') {
      recordAttempt(fromObservation(result.observation))
      return
    }
    if (result.type === 'completed') succeed()
    else fail(new Error(result.error))
  }
  const onError = (event: ErrorEvent) => fail(new OutboxWorkerTransportError(
    event.message || 'Outbox worker crashed',
  ))
  const onClose = () => fail(new OutboxWorkerTransportError('Outbox worker closed unexpectedly'))

  worker.addEventListener('message', onMessage)
  worker.addEventListener('error', onError)
  worker.addEventListener('close', onClose)
  timeout = setTimeout(() => fail(new OutboxWorkerTransportError(
    `Outbox worker timed out after ${timeoutMs}ms`,
  )), timeoutMs)

  try {
    worker.postMessage({ type: 'deliver-pending-events', requestId } satisfies OutboxWorkerCommand)
  } catch (error) {
    fail(new OutboxWorkerTransportError(errorMessage(error)))
  }
})

export interface OutboxCronOptions {
  pattern: string
  timezone: string
  timeoutMs: number
  recordAttempt(observation: RecordDeliveryAttemptInput): void
  createWorker?: () => Worker
}

export const createOutboxCron = (logger: Logger, options: OutboxCronOptions) => {
  let worker: Worker | undefined

  const discardWorker = (target: Worker): void => {
    if (worker !== target) return
    worker = undefined
    target.terminate()
  }

  const ensureWorker = (): Worker => {
    if (worker) return worker

    const created = options.createWorker?.() ?? new Worker(
      new URL('./outbox.worker.ts', import.meta.url).href,
      { name: 'outbox-delivery' },
    )
    created.addEventListener('error', event => {
      logger.error('Outbox worker crashed', { error: event.message })
      discardWorker(created)
    })
    created.addEventListener('close', () => {
      if (worker === created) worker = undefined
    })
    worker = created
    return created
  }

  return new Elysia({ name: 'outbox-cron' })
    .use(cron({
      name: 'outboxDelivery',
      pattern: options.pattern,
      timezone: options.timezone,
      paused: true,
      protect: true,
      catch: error => logger.error('Outbox worker run failed', { error: errorMessage(error) }),
      run: async () => {
        const current = ensureWorker()
        try {
          await requestWorkerRun(current, options)
        } catch (error) {
          discardWorker(current)
          throw error
        }
      },
    }))
    .onStart(({ store }) => {
      ensureWorker()
      store.cron.outboxDelivery.resume()
    })
    .onStop(({ store }) => {
      store.cron.outboxDelivery.stop()
      if (worker) discardWorker(worker)
    })
}
