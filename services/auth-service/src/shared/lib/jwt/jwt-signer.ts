import { importPKCS8, SignJWT } from 'jose'

export interface JwtSigner {
  sign(payload: Record<string, unknown>): Promise<string>
}

export interface JwtSignerOptions {
  /** Формат jose: '15m', '2h', '7d' и т.д. */
  expiresIn?: string
}

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

  return {
    sign: (payload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256', kid })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key),
  }
}
