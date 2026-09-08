import { cron } from '@elysia/cron'
import { Elysia } from 'elysia'
import type { Logger } from '@/shared/lib/logger/logger'
import { errorMessage } from './delivery-error'

export interface OutboxCronOptions {
  pattern: string
  timezone: string
  deliverPendingEvents(): Promise<void>
}

/** Runs the I/O-bound publisher in-process and prevents overlapping batches. */
export const createOutboxCron = (logger: Logger, options: OutboxCronOptions) =>
  new Elysia({ name: 'outbox-cron' })
    .use(cron({
      name: 'outboxDelivery',
      pattern: options.pattern,
      timezone: options.timezone,
      paused: true,
      protect: true,
      catch: error => logger.error('Outbox delivery failed', { error: errorMessage(error) }),
      run: options.deliverPendingEvents,
    }))
    .onStart(({ store }) => store.cron.outboxDelivery.resume())
    .onStop(({ store }) => store.cron.outboxDelivery.stop())
