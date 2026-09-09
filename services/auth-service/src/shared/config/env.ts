import { Value } from '@sinclair/typebox/value'
import { t } from 'elysia'

const databaseEnvSchema = t.Object({
  DATABASE_URL: t.String({ minLength: 1 }),
})

const envSchema = t.Object({
  NODE_ENV: t.Union(
    [t.Literal('development'), t.Literal('test'), t.Literal('production')],
    { default: 'development' },
  ),
  PORT: t.Number({ default: 3000, minimum: 1, maximum: 65535 }),
  DATABASE_URL: t.String({ minLength: 1 }),
  /** base64(PKCS8 PEM) — см. scripts/generate-jwt-keys.ts. Секрет только этого сервиса. */
  JWT_PRIVATE_KEY: t.String({ minLength: 1 }),
  /** base64(SPKI PEM), пара к JWT_PRIVATE_KEY — не секрет, отдаётся на /.well-known/jwks.json. */
  JWT_PUBLIC_KEY: t.String({ minLength: 1 }),
  JWT_KID: t.String({ minLength: 1 }),
  /** Проверяются verifier-ом и не позволяют принять токен другого issuer/назначения. */
  JWT_ISSUER: t.String({ default: 'auth-service', minLength: 1 }),
  JWT_AUDIENCE: t.String({ default: 'api', minLength: 1 }),
  JWT_EXPIRES_IN: t.String({ default: '15m' }),
  /** Срок жизни refresh-токена в днях — сам токен не JWT, expiry считается вручную. */
  REFRESH_TOKEN_TTL_DAYS: t.Number({ default: 30, minimum: 1 }),
  /** Абсолютный срок жизни сессии, который не продлевается при refresh-ротации. */
  SESSION_ABSOLUTE_TTL_DAYS: t.Number({ default: 90, minimum: 1 }),
  /** Защищённый internal endpoint user-service для at-least-once outbox delivery. */
  USER_EVENTS_URL: t.String({
    default: 'http://localhost:3001/internal/events',
    format: 'uri',
  }),
  EVENT_DELIVERY_TOKEN: t.String({ minLength: 16 }),
  OUTBOX_CRON_PATTERN: t.String({ default: '* * * * * *', minLength: 1 }),
  OUTBOX_CRON_TIMEZONE: t.String({ default: 'UTC', minLength: 1 }),
  LOG_LEVEL: t.Union(
    [t.Literal('debug'), t.Literal('info'), t.Literal('warn'), t.Literal('error')],
    { default: 'info' },
  ),
})

export type Env = typeof envSchema.static
export type DatabaseEnv = typeof databaseEnvSchema.static

/** Минимальный конфиг для one-shot миграций, не зависящий от runtime-секретов. */
export const loadDatabaseEnv = (
  source: Record<string, string | undefined> = Bun.env,
): DatabaseEnv => {
  const candidate = Value.Clean(databaseEnvSchema, { ...source })

  if (Value.Check(databaseEnvSchema, candidate)) return candidate

  const problems = [...Value.Errors(databaseEnvSchema, candidate)]
    .map(issue => `  ${issue.path || '/'}: ${issue.message}`)
    .join('\n')

  throw new Error(`Invalid database environment configuration:\n${problems}`)
}

/**
 * Единственное место в проекте, где читается окружение.
 * Падает на старте с перечнем проблем, а не на первом запросе.
 */
export const loadEnv = (source: Record<string, string | undefined> = Bun.env): Env => {
  const candidate = Value.Convert(
    envSchema,
    Value.Default(envSchema, Value.Clean(envSchema, { ...source })),
  )

  if (Value.Check(envSchema, candidate)) return candidate

  const problems = [...Value.Errors(envSchema, candidate)]
    .map(issue => `  ${issue.path || '/'}: ${issue.message}`)
    .join('\n')

  throw new Error(`Invalid environment configuration:\n${problems}`)
}
