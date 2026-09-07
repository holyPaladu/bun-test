import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { exportJWK, importSPKI, jwtVerify } from 'jose'
import { DEFAULT_JWT_AUDIENCE, DEFAULT_JWT_ISSUER } from '@/shared/lib/jwt/jwt-signer'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

const accessTokenPayloadSchema = Type.Object(
  {
    iss: Type.String({ minLength: 1 }),
    aud: Type.String({ minLength: 1 }),
    sub: Type.String({ pattern: uuidPattern }),
    sid: Type.String({ pattern: uuidPattern }),
    iat: Type.Integer({ minimum: 0 }),
    exp: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export type AccessTokenPayload = Static<typeof accessTokenPayloadSchema>

export interface JwtVerifierOptions {
  issuer?: string
  audience?: string
}

/** Ровно то, что реально экспортирует сервис — не общий jose.JWK. */
export interface EcPublicJwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  kid: string
  alg: 'ES256'
  use: 'sig'
}

export interface JwtVerifier {
  verify(token: string): Promise<AccessTokenPayload>
  /** То, что отдаётся на /.well-known/jwks.json. */
  publicJwk: EcPublicJwk
}

/** publicKeyB64 — публичный ключ ES256 (SPKI PEM) в base64, пара к приватному из JwtSigner. */
export const JwtVerifier = async (
  publicKeyB64: string,
  kid: string,
  options: JwtVerifierOptions = {},
): Promise<JwtVerifier> => {
  const pem = Buffer.from(publicKeyB64, 'base64').toString('utf8')
  const key = await importSPKI(pem, 'ES256')
  const jwk = await exportJWK(key)
  const issuer = options.issuer ?? DEFAULT_JWT_ISSUER
  const audience = options.audience ?? DEFAULT_JWT_AUDIENCE

  const publicJwk: EcPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x!,
    y: jwk.y!,
    kid,
    alg: 'ES256',
    use: 'sig',
  }

  return {
    verify: async (token) => {
      const { payload, protectedHeader } = await jwtVerify(token, key, {
        algorithms: ['ES256'],
        issuer,
        audience,
        typ: 'JWT',
        requiredClaims: ['iss', 'aud', 'sub', 'sid', 'iat', 'exp'],
      })

      if (protectedHeader.kid !== kid || !Value.Check(accessTokenPayloadSchema, payload)) {
        throw new Error('Invalid access token structure')
      }
      if (payload.exp <= payload.iat) throw new Error('Invalid access token lifetime')

      return payload
    },
    publicJwk,
  }
}
