import { t } from 'elysia'

/**
 * Сервис всегда подписывает ES256/P-256 (см. JwtSigner) — схема описывает
 * ровно то, что реально уходит наружу, а не универсальный JWK.
 */
export const jwksSchemas = {
  jwks: t.Object({
    keys: t.Array(
      t.Object({
        kty: t.Literal('EC'),
        crv: t.Literal('P-256'),
        x: t.String(),
        y: t.String(),
        kid: t.String(),
        alg: t.Literal('ES256'),
        use: t.Literal('sig'),
      }),
    ),
  }),
}
