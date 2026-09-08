import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '@/app'
import type { Container } from '@/container'
import type { AccessTokenInput } from '@/shared/lib/jwt/jwt-signer'
import type { AccessTokenPayload, JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import type { Logger } from '@/shared/lib/logger/logger'
import { createInMemoryDatabase, type InMemoryDatabase } from '../helpers/in-memory-database'
import { createAuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import { createPrometheusRegistry } from '@/shared/http/routes/metrics/prometheus.registry'

const password = 'password-123'
const email = 'user@example.com'

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

interface TestContext {
  app: ReturnType<typeof createApp>
  database: InMemoryDatabase
}

const createContext = (): TestContext => {
  const database = createInMemoryDatabase()
  const accessTokens = new Map<string, AccessTokenPayload>()
  let tokenSequence = 1

  const jwtSigner = {
    sign: async ({ subject, sessionId }: AccessTokenInput) => {
      const token = `access-token-${tokenSequence++}`
      const iat = Math.floor(Date.now() / 1000)
      accessTokens.set(token, {
        iss: 'test-auth', aud: 'test-api', sub: subject, sid: sessionId, iat, exp: iat + 900,
      })
      return token
    },
  }
  const jwtVerifier: JwtVerifier = {
    verify: async token => {
      const payload = accessTokens.get(token)
      if (!payload) throw new Error('Invalid token')
      return payload
    },
    publicJwk: {
      kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y', kid: 'test-key',
      alg: 'ES256', use: 'sig',
    },
  }
  const container: Container = {
    sql: database.sql,
    logger: silentLogger,
    passwordHasher: {
      hash: async value => `hashed:${value}`,
      verify: async (value, hash) => hash === `hashed:${value}`,
    },
    jwtSigner,
    jwtVerifier,
    unitOfWork: createAuthUnitOfWork(database.sql),
    metricsRegistry: createPrometheusRegistry(),
    env: {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'memory://auth',
      JWT_PRIVATE_KEY: 'unused',
      JWT_PUBLIC_KEY: 'unused',
      JWT_KID: 'test-key',
      JWT_ISSUER: 'test-auth',
      JWT_AUDIENCE: 'test-api',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      SESSION_ABSOLUTE_TTL_DAYS: 90,
      USER_EVENTS_URL: 'http://user-service/internal/events',
      EVENT_DELIVERY_TOKEN: 'test-delivery-token',
      LOG_LEVEL: 'error',
    },
  }

  return { app: createApp(container), database }
}

const json = async (response: Response) => response.json() as Promise<Record<string, any>>

const call = (
  context: TestContext,
  path: string,
  options: { method?: string; body?: unknown; token?: string; userAgent?: string } = {},
) => {
  const headers = new Headers()
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.token) headers.set('authorization', `Bearer ${options.token}`)
  if (options.userAgent) headers.set('user-agent', options.userAgent)

  return context.app.handle(new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }))
}

const register = async (context: TestContext) => call(context, '/api/auth/register', {
  method: 'POST', body: { email, password },
})

const login = async (context: TestContext, loginPassword = password) => {
  const response = await call(context, '/api/auth/login', {
    method: 'POST',
    body: { email, password: loginPassword },
    userAgent: 'e2e-browser',
  })
  return { response, body: await json(response) }
}

describe('auth service HTTP e2e', () => {
  let context: TestContext

  beforeEach(() => {
    context = createContext()
  })

  test('serves health and JWKS outside the business response envelope', async () => {
    const health = await call(context, '/health/check')
    const ready = await call(context, '/health/db-ready')
    const jwks = await call(context, '/.well-known/jwks.json')
    const metrics = await call(context, '/metrics')

    expect(health.status).toBe(200)
    expect(await json(health)).toEqual({ status: 'ok' })
    expect(await json(ready)).toEqual({ status: 'ok' })
    expect(await json(jwks)).toEqual({ keys: [expect.objectContaining({
      kid: 'test-key', alg: 'ES256', use: 'sig',
    })] })
    expect(metrics.status).toBe(200)
    expect(await metrics.text()).toContain('auth_outbox_pending_events 0')
  })

  test('registers a normalized auth account and validates request bodies', async () => {
    const response = await call(context, '/api/auth/register', {
      method: 'POST', body: { email: 'USER@EXAMPLE.COM', password },
    })

    expect(response.status).toBe(201)
    expect(await json(response)).toEqual({
      success: true,
      data: { message: 'User registered successfully' },
    })
    expect(context.database.authAccounts[0]).toMatchObject({
      email, password_hash: `hashed:${password}`,
    })
    expect(context.database.outboxEvents[0]).toMatchObject({
      event_type: 'auth.account-created.v1',
      aggregate_id: context.database.authAccounts[0].id,
    })

    const invalid = await call(context, '/api/auth/register', {
      method: 'POST', body: { email: 'not-an-email', password: 'short' },
    })
    expect(invalid.status).toBe(422)
    expect(await json(invalid)).toMatchObject({ error: { code: 'VALIDATION_FAILED' } })
  })

  test('logs in, guards private routes, and returns paginated sessions', async () => {
    await register(context)

    const wrongPassword = await login(context, 'wrong-password')
    expect(wrongPassword.response.status).toBe(401)
    expect(wrongPassword.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })

    const authenticated = await login(context)
    expect(authenticated.response.status).toBe(200)
    expect(authenticated.body).toEqual({
      success: true,
      data: { accessToken: expect.any(String), refreshToken: expect.any(String) },
    })

    const anonymous = await call(context, '/api/auth/sessions')
    expect(anonymous.status).toBe(401)
    expect(await json(anonymous)).toMatchObject({ error: { code: 'UNAUTHORIZED' } })

    const sessions = await call(context, '/api/auth/sessions?page=1&perPage=10', {
      token: authenticated.body.data.accessToken,
    })
    expect(sessions.status).toBe(200)
    expect(await json(sessions)).toMatchObject({
      success: true,
      data: {
        items: [{ userId: context.database.authAccounts[0].id, userAgent: 'e2e-browser' }],
        pagination: { page: 1, perPage: 10, total: 1, hasMore: false },
      },
    })
  })

  test('rotates refresh tokens and revokes the session when an old token is reused', async () => {
    await register(context)
    const authenticated = await login(context)
    const oldRefreshToken = authenticated.body.data.refreshToken as string

    const rotated = await call(context, '/api/auth/refresh-token', {
      method: 'POST', body: { refreshToken: oldRefreshToken }, userAgent: 'new-browser-data',
    })
    const rotatedBody = await json(rotated)
    expect(rotated.status).toBe(200)
    expect(rotatedBody.success).toBe(true)
    expect(typeof rotatedBody.data.accessToken).toBe('string')
    expect(typeof rotatedBody.data.refreshToken).toBe('string')
    expect(rotatedBody.data.refreshToken).not.toBe(oldRefreshToken)
    expect(context.database.refreshTokens[0].replaced_by).toBe(context.database.refreshTokens[1].id)

    const reuse = await call(context, '/api/auth/refresh-token', {
      method: 'POST', body: { refreshToken: oldRefreshToken },
    })
    expect(reuse.status).toBe(401)
    expect(await json(reuse)).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
    expect(context.database.sessions[0].revoked_reason).toBe('reuse_detected')

    const nextTokenAfterReuse = await call(context, '/api/auth/refresh-token', {
      method: 'POST', body: { refreshToken: rotatedBody.data.refreshToken },
    })
    expect({ status: nextTokenAfterReuse.status, body: await nextTokenAfterReuse.text() }).toEqual({
      status: 401,
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
    })
  })

  test('logs out one session and can revoke another owned session', async () => {
    await register(context)
    const first = await login(context)
    const second = await login(context)

    const revoke = await call(context, `/api/auth/session/${context.database.sessions[0].id}`, {
      method: 'DELETE', token: second.body.data.accessToken,
    })
    expect(revoke.status).toBe(204)
    expect(context.database.sessions[0].revoked_reason).toBe('user_revoked')

    const logout = await call(context, '/api/auth/logout', {
      method: 'POST', body: { refreshToken: second.body.data.refreshToken },
    })
    expect(logout.status).toBe(200)
    expect(context.database.sessions[1].revoked_reason).toBe('logout')

    const repeatedLogout = await call(context, '/api/auth/logout', {
      method: 'POST', body: { refreshToken: second.body.data.refreshToken },
    })
    expect(repeatedLogout.status).toBe(401)
    expect(first.body.data.accessToken).toBeString()
  })

  test('changes the password atomically and revokes all existing sessions', async () => {
    await register(context)
    const authenticated = await login(context)

    const wrongOldPassword = await call(context, '/api/auth/change-password', {
      method: 'PUT', token: authenticated.body.data.accessToken,
      body: { oldPassword: 'incorrect-old', newPassword: 'new-password-456' },
    })
    expect(wrongOldPassword.status).toBe(401)

    const changed = await call(context, '/api/auth/change-password', {
      method: 'PUT', token: authenticated.body.data.accessToken,
      body: { oldPassword: password, newPassword: 'new-password-456' },
    })
    expect(changed.status).toBe(204)
    expect(context.database.authAccounts[0].password_hash).toBe('hashed:new-password-456')
    expect(context.database.sessions[0].revoked_reason).toBe('password_change')

    expect((await login(context)).response.status).toBe(401)
    expect((await login(context, 'new-password-456')).response.status).toBe(200)
  })

  test('logs out from all active sessions', async () => {
    await register(context)
    const first = await login(context)
    await login(context)

    const response = await call(context, '/api/auth/logout-all', {
      method: 'POST', token: first.body.data.accessToken,
    })
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({
      success: true, data: { message: 'Logged out from all sessions successfully' },
    })
    expect(context.database.sessions.every(session => session.revoked_reason === 'logout_all')).toBe(true)
  })

  test('returns a structured parse error and 404 for unknown routes', async () => {
    const malformed = await context.app.handle(new Request('http://localhost/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken',
    }))
    const missing = await call(context, '/does-not-exist')

    expect(malformed.status).toBe(400)
    expect(await malformed.text()).toBe(JSON.stringify({
      error: { code: 'MALFORMED_REQUEST', message: 'Request body could not be parsed' },
    }))
    expect(missing.status).toBe(404)
  })
})
