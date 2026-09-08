import { loadEnv } from '@/shared/config/env'
import { createDatabaseClient } from '@/shared/database/client'
import { createLogger } from '@/shared/lib/logger/logger'
import { createDeliverPendingEvents } from './deliver-pending-events'
import { createHttpEventSender } from './http/send-event.http'
import {
  errorMessage,
  type OutboxWorkerCommand,
  type OutboxWorkerResult,
} from './outbox-worker.messages'
import { createOutboxRepository } from './repo/outbox.repository'

declare var self: Worker

const OUTBOX_DELIVERY_POLICY = {
  batchSize: 10,
  leaseMs: 30_000,
  maxAttempts: 10,
  baseRetryMs: 1_000,
  maxRetryMs: 300_000,
  jitterRatio: 0.2,
  requestTimeoutMs: 3_000,
} as const

let activeRequestId: string | undefined

const createOutboxWorkerDeps = async () => {
  const env = loadEnv()
  const sql = createDatabaseClient(env)
  const logger = createLogger(env)
  const outbox = createOutboxRepository(sql)

  return {
    deliverPendingEvents: createDeliverPendingEvents({
      outbox,
      sendEvent: createHttpEventSender({
        url: env.USER_EVENTS_URL,
        token: env.EVENT_DELIVERY_TOKEN,
        timeoutMs: OUTBOX_DELIVERY_POLICY.requestTimeoutMs,
      }),
      metrics: {
        recordAttempt: observation => {
          if (!activeRequestId) return
          self.postMessage({
            type: 'delivery-attempt',
            requestId: activeRequestId,
            observation: {
              ...observation,
              occurredAt: observation.occurredAt.toISOString(),
              completedAt: observation.completedAt.toISOString(),
            },
          } satisfies OutboxWorkerResult)
        },
      },
      logger,
      options: {
        workerId: crypto.randomUUID(),
        batchSize: OUTBOX_DELIVERY_POLICY.batchSize,
        leaseMs: OUTBOX_DELIVERY_POLICY.leaseMs,
        maxAttempts: OUTBOX_DELIVERY_POLICY.maxAttempts,
        baseRetryMs: OUTBOX_DELIVERY_POLICY.baseRetryMs,
        maxRetryMs: OUTBOX_DELIVERY_POLICY.maxRetryMs,
        jitterRatio: OUTBOX_DELIVERY_POLICY.jitterRatio,
      },
    }),
  }
}

let dependencies: Promise<Awaited<ReturnType<typeof createOutboxWorkerDeps>>> | undefined

// Register before dependency initialization so an early command cannot be lost.
self.onmessage = ({ data }: MessageEvent<OutboxWorkerCommand>) => {
  if (data?.type !== 'deliver-pending-events' || typeof data.requestId !== 'string') return

  activeRequestId = data.requestId
  dependencies ??= createOutboxWorkerDeps()

  void dependencies
    .then(({ deliverPendingEvents }) => deliverPendingEvents())
    .then(() => self.postMessage({
      type: 'completed',
      requestId: data.requestId,
    } satisfies OutboxWorkerResult))
    .catch(error => self.postMessage({
      type: 'failed',
      requestId: data.requestId,
      error: errorMessage(error),
    } satisfies OutboxWorkerResult))
    .finally(() => {
      if (activeRequestId === data.requestId) activeRequestId = undefined
    })
}
