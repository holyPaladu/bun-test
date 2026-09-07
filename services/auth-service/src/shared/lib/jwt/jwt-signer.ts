import { importPKCS8, SignJWT } from 'jose'

export interface AccessTokenInput {
  subject: string
  sessionId: string
}

export interface JwtSigner {
  sign(input: AccessTokenInput): Promise<string>
}

export interface JwtSignerOptions {
  /** Формат jose: '15m', '2h', '7d' и т.д. */
  expiresIn?: string
  issuer?: string
  audience?: string
}

export const DEFAULT_JWT_ISSUER = 'auth-service'
export const DEFAULT_JWT_AUDIENCE = 'api'

/**
 * privateKeyB64 — приватный ключ ES256 (PKCS8 PEM), закодированный в base64,
 * чтобы спокойно жить одной строкой в .env. Существует только здесь: другие
 * сервисы получают возможность проверять токены через /.well-known/jwks.json
 * (см. JwtVerifier), но подписывать не могут — приватный ключ туда не уходит.
 */
export const JwtSigner = async (
  privateKeyB64: string,
  kid: string,
  options: JwtSignerOptions = {},
): Promise<JwtSigner> => {
  const pem = Buffer.from(privateKeyB64, 'base64').toString('utf8')
  const key = await importPKCS8(pem, 'ES256')
  const expiresIn = options.expiresIn ?? '15m'
  const issuer = options.issuer ?? DEFAULT_JWT_ISSUER
  const audience = options.audience ?? DEFAULT_JWT_AUDIENCE

  return {
    sign: ({ subject, sessionId }) =>
      new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key),
  }
}
