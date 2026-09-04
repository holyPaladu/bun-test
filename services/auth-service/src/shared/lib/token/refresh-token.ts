/**
 * Refresh-токен — не JWT: его никто, кроме auth-service, не проверяет,
 * а хранение в БД (по хэшу) даёт то, чего подписанному токену не дать
 * бесплатно — отзыв и ротацию. Клиенту уходит сырой токен, в БД — только
 * его sha256-хэш (это высокоэнтропийный секрет, а не пароль, поэтому
 * argon2 здесь избыточен).
 *
 * Только Bun-нативные API: Web Crypto (`crypto.getRandomValues`, глобальный
 * в Bun) вместо `node:crypto`, `Bun.CryptoHasher` вместо `createHash`.
 */
export interface RefreshTokenGenerator {
  generate(): string
  hash(token: string): string
}

export const refreshTokenGenerator: RefreshTokenGenerator = {
  generate: () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
  hash: token => new Bun.CryptoHasher('sha256').update(token).digest('hex'),
}
