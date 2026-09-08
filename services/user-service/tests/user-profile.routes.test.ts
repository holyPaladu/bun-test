import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import {
  createUserProfileRoutes,
  type UserProfileRoutesDeps,
} from '@/modules/user-profile/http/user-profile.routes'
import { createErrorHandler } from '@/shared/http/error-handler'
import { successEnvelope } from '@/shared/http/success-envelope'
import { JwtVerifierUnavailableError, type JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'

const userId = '550e8400-e29b-41d4-a716-446655440000'
const sessionId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const now = new Date('2026-09-07T10:00:00.000Z')

const profile = (changes: Partial<UserProfile> = {}): UserProfile => ({
  id: userId,
  displayName: null,
  avatarUrl: null,
  locale: null,
  timezone: null,
  createdAt: now,
  updatedAt: now,
  ...changes,
})

const validPayload = {
  iss: 'auth-service',
  aud: 'api',
  sub: userId,
  sid: sessionId,
  iat: 1,
  exp: 2,
}

const createTestApp = (overrides: Partial<UserProfileRoutesDeps> = {}) => {
  const noop = () => undefined
  const getMyProfile = mock(async ({ userId: id }: { userId: string }) => profile({ id }))
  const updateMyProfile = mock(async ({ userId: id, ...input }: {
    userId: string
    displayName?: string | null
    locale?: string | null
  }) => profile({ id, ...input }))
  const jwtVerifier: JwtVerifier = { verify: mock(async () => validPayload) }

  const dependencies: UserProfileRoutesDeps = {
    jwtVerifier,
    getMyProfile,
    updateMyProfile,
    ...overrides,
  }

  const app = new Elysia()
    .use(createErrorHandler({ debug: noop, info: noop, warn: noop, error: noop }))
    .group('/api', group => group
      .use(successEnvelope)
      .use(createUserProfileRoutes(dependencies)),
    )

  return { app, getMyProfile, updateMyProfile }
}

describe('user profile routes', () => {
  test('GET /me derives the profile id only from verified JWT sub', async () => {
    const { app, getMyProfile } = createTestApp()
    const response = await app.handle(new Request('http://service/api/users/me', {
      headers: { authorization: 'Bearer access-token' },
    }))

    expect(response.status).toBe(200)
    expect(getMyProfile).toHaveBeenCalledWith({ userId })
    expect(await response.json()).toEqual({
      data: {
        id: userId,
        displayName: null,
        avatarUrl: null,
        locale: null,
        timezone: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
  })

  test('PATCH /me updates allow-listed fields for verified JWT sub', async () => {
    const { app, updateMyProfile } = createTestApp()
    const response = await app.handle(new Request('http://service/api/users/me', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Arsen', locale: 'ru' }),
    }))

    expect(response.status).toBe(200)
    expect(updateMyProfile).toHaveBeenCalledWith({
      userId, displayName: 'Arsen', locale: 'ru',
    })
  })

  test('PATCH /me rejects userId and does not call the use case', async () => {
    const { app, updateMyProfile } = createTestApp()
    const response = await app.handle(new Request('http://service/api/users/me', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001' }),
    }))

    expect(response.status).toBe(422)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  test('uses one 401 response for missing and malformed bearer credentials', async () => {
    const { app } = createTestApp()

    for (const authorization of [undefined, 'Bearer token extra']) {
      const response = await app.handle(new Request('http://service/api/users/me', {
        headers: authorization ? { authorization } : undefined,
      }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      })
    }
  })

  test('returns 503 when an unknown kid requires an unavailable JWKS refresh', async () => {
    const jwtVerifier: JwtVerifier = {
      verify: mock(async () => { throw new JwtVerifierUnavailableError() }),
    }
    const { app } = createTestApp({ jwtVerifier })
    const response = await app.handle(new Request('http://service/api/users/me', {
      headers: { authorization: 'Bearer access-token' },
    }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: {
        code: 'AUTH_VERIFICATION_UNAVAILABLE',
        message: 'Authentication verification is temporarily unavailable',
      },
    })
  })
})
