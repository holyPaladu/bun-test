import { exportJWK, importSPKI, jwtVerify } from 'jose'

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
  verify(token: string): Promise<Record<string, unknown>>
  /** То, что отдаётся на /.well-known/jwks.json. */
  publicJwk: EcPublicJwk
}

/** publicKeyB64 — публичный ключ ES256 (SPKI PEM) в base64, пара к приватному из JwtSigner. */
export const JwtVerifier = async (publicKeyB64: string, kid: string): Promise<JwtVerifier> => {
  const pem = Buffer.from(publicKeyB64, 'base64').toString('utf8')
  const key = await importSPKI(pem, 'ES256')
  const jwk = await exportJWK(key)

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
      const { payload } = await jwtVerify(token, key)
      return payload
    },
    publicJwk,
  }
}
