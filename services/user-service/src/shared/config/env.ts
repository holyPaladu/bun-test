import { Value } from '@sinclair/typebox/value'
import { t } from 'elysia'

const envSchema = t.Object({
  NODE_ENV: t.Union(
    [t.Literal('development'), t.Literal('test'), t.Literal('production')],
    { default: 'development' },
  ),
  PORT: t.Number({ default: 3001, minimum: 1, maximum: 65535 }),
  DATABASE_URL: t.String({ minLength: 1 }),
  /** Фиксированный доверенный endpoint auth-service; никогда не берётся из запроса. */
  AUTH_JWKS_URL: t.String({ format: 'uri' }),
  AUTH_JWT_ISSUER: t.String({ default: 'auth-service', minLength: 1 }),
  AUTH_JWT_AUDIENCE: t.String({ default: 'api', minLength: 1 }),
  AUTH_JWKS_TIMEOUT_MS: t.Number({ default: 3000, minimum: 100, maximum: 30000 }),
  AUTH_JWT_CLOCK_TOLERANCE_SEC: t.Number({ default: 5, minimum: 0, maximum: 60 }),
  EVENT_CONSUMER_TOKEN: t.String({ minLength: 16 }),
  LOG_LEVEL: t.Union(
    [t.Literal('debug'), t.Literal('info'), t.Literal('warn'), t.Literal('error')],
    { default: 'info' },
  ),
})

export type Env = typeof envSchema.static

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
