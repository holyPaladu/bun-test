import pino from 'pino'
import type { Env } from '@/shared/config/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/**
 * pino пишет NDJSON в stdout всегда — и в dev, и в проде (в т.ч. в скомпилированном
 * бинаре из `bun build --compile`, где воркер-транспорты pino ненадёжны).
 * Читаемый вывод в dev получаем снаружи: `bun run dev` пайпит stdout в pino-pretty.
 */
export const createLogger = (env: Pick<Env, 'LOG_LEVEL'>): Logger => {
  const instance = pino({ level: env.LOG_LEVEL })

  const write = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    if (context) instance[level](context, message)
    else instance[level](message)
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  }
}
