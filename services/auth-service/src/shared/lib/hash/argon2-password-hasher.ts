export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}

/** Обёртка над Bun.password — единственное место, где выбирается алгоритм хэширования. */
export const argon2PasswordHasher: PasswordHasher = {
  hash: password => Bun.password.hash(password, { algorithm: 'argon2id' }),
  verify: (password, hash) => Bun.password.verify(password, hash),
}
