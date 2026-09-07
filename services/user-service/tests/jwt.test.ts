import { beforeAll, describe, expect, test } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import {
  JwtVerifier,
  JwtVerifierUnavailableError,
} from '@/shared/lib/jwt/jwt-verifier'

const userId = '550e8400-e29b-41d4-a716-446655440000'
const sessionId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const issuer = 'test-auth-service'
const audience = 'test-api'
const kid = 'test-key'

let privateKey: CryptoKey
let verifier: JwtVerifier
let jwksResponse: object
let fetchCount = 0

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true })
  privateKey = pair.privateKey
  const publicJwk = await exportJWK(pair.publicKey)

  jwksResponse = { keys: [{ ...publicJwk, kid, alg: 'ES256', use: 'sig' }] }

  verifier = JwtVerifier({
    jwksUrl: 'https://auth.test/.well-known/jwks.json',
    issuer,
    audience,
    timeoutMs: 1000,
    clockToleranceSec: 0,
    fetchJwks: async () => {
      fetchCount += 1
      return Response.json(jwksResponse)
    },
  })
})

const sign = async (changes: Record<string, unknown> = {}) => {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({
    iss: issuer,
    aud: audience,
    sub: userId,
    sid: sessionId,
    iat,
    exp: iat + 900,
    ...changes,
  })
    .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
    .sign(privateKey)
}

describe('remote JWKS access-token verifier', () => {
  test('accepts a token issued by auth-service and returns identity claims', async () => {
    const payload = await verifier.verify(await sign())
    expect(payload.sub).toBe(userId)
    expect(payload.sid).toBe(sessionId)
  })

  test('uses the cached JWKS for subsequent tokens with the same kid', async () => {
    const previousFetchCount = fetchCount
    await verifier.verify(await sign())
    expect(fetchCount).toBe(previousFetchCount)
  })

  test('rejects an unexpected issuer', async () => {
    await expect(verifier.verify(await sign({ iss: 'another-service' }))).rejects.toThrow()
  })

  test('rejects claims outside the access-token contract', async () => {
    await expect(verifier.verify(await sign({ role: 'admin' }))).rejects.toThrow(
      'Invalid access token structure',
    )
  })

  test('distinguishes JWKS transport failure from an invalid token', async () => {
    const unavailableVerifier = JwtVerifier({
      jwksUrl: 'https://unavailable.test/.well-known/jwks.json',
      issuer,
      audience,
      timeoutMs: 1000,
      clockToleranceSec: 0,
      fetchJwks: async () => { throw new TypeError('network unavailable') },
    })

    await expect(unavailableVerifier.verify(await sign())).rejects.toBeInstanceOf(
      JwtVerifierUnavailableError,
    )
  })

  test('treats a non-success JWKS response as infrastructure failure', async () => {
    const unavailableVerifier = JwtVerifier({
      jwksUrl: 'https://unavailable.test/.well-known/jwks.json',
      issuer,
      audience,
      timeoutMs: 1000,
      clockToleranceSec: 0,
      fetchJwks: async () => new Response(null, { status: 503 }),
    })

    await expect(unavailableVerifier.verify(await sign())).rejects.toBeInstanceOf(
      JwtVerifierUnavailableError,
    )
  })
})
