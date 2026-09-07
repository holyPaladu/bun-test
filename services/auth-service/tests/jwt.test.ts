import { describe, expect, test } from 'bun:test'
import {
  decodeProtectedHeader,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  SignJWT,
} from 'jose'
import { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'

const userId = '550e8400-e29b-41d4-a716-446655440000'
const sessionId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const kid = 'test-key'
const issuer = 'test-auth-service'
const audience = 'test-api'

const fixture = (async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const [privatePem, publicPem] = await Promise.all([
    exportPKCS8(privateKey),
    exportSPKI(publicKey),
  ])
  const privateKeyB64 = Buffer.from(privatePem).toString('base64')
  const publicKeyB64 = Buffer.from(publicPem).toString('base64')

  return {
    privateKey: await importPKCS8(privatePem, 'ES256'),
    signer: await JwtSigner(privateKeyB64, kid, { issuer, audience, expiresIn: '15m' }),
    verifier: await JwtVerifier(publicKeyB64, kid, { issuer, audience }),
  }
})()

const validPayload = () => {
  const iat = Math.floor(Date.now() / 1000)
  return { iss: issuer, aud: audience, sub: userId, sid: sessionId, iat, exp: iat + 900 }
}

const signPayload = async (
  payload: Record<string, unknown>,
  header: { alg: 'ES256'; kid: string; typ: string } = { alg: 'ES256', kid, typ: 'JWT' },
) => {
  const { privateKey } = await fixture
  return new SignJWT(payload).setProtectedHeader(header).sign(privateKey)
}

describe('access JWT', () => {
  test('signs and verifies the complete, trusted payload', async () => {
    const { signer, verifier } = await fixture
    const token = await signer.sign({ subject: userId, sessionId })
    const payload = await verifier.verify(token)

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'ES256', kid, typ: 'JWT' })
    expect(payload).toMatchObject({ iss: issuer, aud: audience, sub: userId, sid: sessionId })
    expect(Number.isInteger(payload.iat)).toBe(true)
    expect(payload.exp).toBeGreaterThan(payload.iat)
  })

  test.each([
    ['wrong issuer', { ...validPayload(), iss: 'another-service' }],
    ['wrong audience', { ...validPayload(), aud: 'another-api' }],
    ['missing subject', (() => { const { sub: _, ...payload } = validPayload(); return payload })()],
    ['missing session', (() => { const { sid: _, ...payload } = validPayload(); return payload })()],
    ['malformed subject', { ...validPayload(), sub: 'not-a-uuid' }],
    ['malformed session', { ...validPayload(), sid: 'not-a-uuid' }],
    ['additional claim', { ...validPayload(), role: 'admin' }],
  ])('rejects %s', async (_name, payload) => {
    const { verifier } = await fixture
    await expect(verifier.verify(await signPayload(payload))).rejects.toThrow()
  })

  test('rejects a token with another key id', async () => {
    const { verifier } = await fixture
    const token = await signPayload(validPayload(), { alg: 'ES256', kid: 'another-key', typ: 'JWT' })
    await expect(verifier.verify(token)).rejects.toThrow('Invalid access token structure')
  })

  test('rejects a non-JWT typ header', async () => {
    const { verifier } = await fixture
    const token = await signPayload(validPayload(), { alg: 'ES256', kid, typ: 'not-jwt' })
    await expect(verifier.verify(token)).rejects.toThrow()
  })

  test('allows only ES256', async () => {
    const { verifier } = await fixture
    const token = await new SignJWT(validPayload())
      .setProtectedHeader({ alg: 'HS256', kid, typ: 'JWT' })
      .sign(new TextEncoder().encode('a-test-secret-that-is-at-least-32-bytes-long'))

    try {
      await verifier.verify(token)
      throw new Error('Expected verification to fail')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('ERR_JOSE_ALG_NOT_ALLOWED')
    }
  })

  test('rejects exp that is not later than iat', async () => {
    const { verifier } = await fixture
    const payload = validPayload()
    payload.iat += 1_000
    payload.exp = payload.iat

    await expect(verifier.verify(await signPayload(payload))).rejects.toThrow(
      'Invalid access token lifetime',
    )
  })
})
