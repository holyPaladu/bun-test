import { Elysia } from 'elysia'
import type { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import { jwksSchemas } from './jwks.schema'

/**
 * Стандартный путь по RFC 8615 — вне /api и вне версионирования.
 * Другие сервисы забирают отсюда публичный ключ и проверяют токены сами,
 * без обращения к auth-service на каждый запрос (jose.createRemoteJWKSet + кэш).
 */
export const createJwksRoute = (jwtVerifier: JwtVerifier) =>
  new Elysia({ tags: ['system'] })
    .model(jwksSchemas)
    .get(
      '/.well-known/jwks.json',
      () => ({ keys: [jwtVerifier.publicJwk] }),
      { response: { 200: 'jwks' } },
    )
