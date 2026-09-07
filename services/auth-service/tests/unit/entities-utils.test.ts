import { describe, expect, test } from 'bun:test'
import { toAuthAccount } from '@/modules/auth/entities/auth-account.entity'
import { toRefreshToken } from '@/modules/session/entities/refresh.entity'
import { toSession } from '@/modules/session/entities/session.entity'
import {
  AlreadyExistsError,
  isAppError,
  NotFoundError,
  UnauthorizedError,
  AuthAccountBlockedError,
} from '@/shared/errors/app-error'
import { loadEnv } from '@/shared/config/env'
import { refreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { normalizeEmail } from '@/shared/utils/normalizer'

const date = new Date('2026-01-02T03:04:05.000Z')

describe('entity mappers', () => {
  test('maps a database auth-account row to the domain shape', () => {
    expect(toAuthAccount({
      id: 'user-id', email: 'a@example.com', password_hash: 'hash', auth_status: 'active',
      created_at: date, updated_at: date,
    })).toEqual({
      id: 'user-id', email: 'a@example.com', passwordHash: 'hash', authStatus: 'active',
      createdAt: date, updatedAt: date,
    })
  })

  test('maps a database session row to the domain shape', () => {
    expect(toSession({
      id: 'session-id', user_id: 'user-id', created_at: date, absolute_expires_at: date,
      last_seen_at: null, ip_address: null, user_agent: 'browser', revoked_at: null,
      revoked_reason: null,
    })).toMatchObject({
      id: 'session-id', userId: 'user-id', absoluteExpiresAt: date,
      lastSeenAt: null, userAgent: 'browser', revokedReason: null,
    })
  })

  test('maps a database refresh-token row to the domain shape', () => {
    expect(toRefreshToken({
      id: 'token-id', session_id: 'session-id', user_id: 'user-id', token_hash: 'hash',
      expires_at: date, created_at: date, updated_at: date, revoked_at: null,
      ip_address: '127.0.0.1', user_agent: null, last_used_at: null, replaced_by: null,
    })).toMatchObject({
      id: 'token-id', sessionId: 'session-id', userId: 'user-id', tokenHash: 'hash',
      expiresAt: date, ipAddress: '127.0.0.1', replacedBy: null,
    })
  })
})

describe('shared utilities', () => {
  test('normalizes email whitespace and case', () => {
    expect(normalizeEmail('  Alice.Example@MAIL.COM  ')).toBe('alice.example@mail.com')
  })

  test('generates opaque unique refresh tokens and stable SHA-256 hashes', () => {
    const first = refreshTokenGenerator.generate()
    const second = refreshTokenGenerator.generate()

    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(refreshTokenGenerator.hash(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(refreshTokenGenerator.hash(first)).toBe(refreshTokenGenerator.hash(first))
    expect(refreshTokenGenerator.hash(first)).not.toBe(refreshTokenGenerator.hash(second))
  })
})

describe('application errors', () => {
  test.each([
    [new AlreadyExistsError('User'), 409, 'ALREADY_EXISTS', 'User already exists'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED', 'Unauthorized'],
    [new NotFoundError('Session'), 404, 'NOT_FOUND', 'Session not found'],
    [new AuthAccountBlockedError(), 403, 'USER_BLOCKED', 'User is blocked'],
  ])('exposes a stable HTTP contract', (error, status, code, message) => {
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({ status, code, message })
  })

  test('does not classify arbitrary errors as application errors', () => {
    expect(isAppError(new Error('boom'))).toBe(false)
  })
})

describe('environment configuration', () => {
  const required = {
    DATABASE_URL: 'postgres://localhost/auth',
    JWT_PRIVATE_KEY: 'private',
    JWT_PUBLIC_KEY: 'public',
    JWT_KID: 'key-1',
    EVENT_DELIVERY_TOKEN: 'test-delivery-token',
  }

  test('applies defaults and converts numeric environment values', () => {
    expect(loadEnv({ ...required, PORT: '4567', REFRESH_TOKEN_TTL_DAYS: '7' })).toMatchObject({
      NODE_ENV: 'development', PORT: 4567, JWT_ISSUER: 'auth-service', JWT_AUDIENCE: 'api',
      JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_TTL_DAYS: 7, SESSION_ABSOLUTE_TTL_DAYS: 90,
      LOG_LEVEL: 'info',
    })
  })

  test('rejects missing required values and out-of-range numbers', () => {
    expect(() => loadEnv({ ...required, DATABASE_URL: undefined })).toThrow('/DATABASE_URL')
    expect(() => loadEnv({ ...required, PORT: '70000' })).toThrow('/PORT')
  })
})
