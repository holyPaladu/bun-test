import { loadEnv, type Env } from '@/shared/config/env'
import { createAuthUnitOfWork, type AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import { createDatabaseClient, type DatabaseClient } from '@/shared/database/client'
import { argon2PasswordHasher, type PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import { createLogger, type Logger } from '@/shared/lib/logger/logger'

export interface Container {
  env: Env
  sql: DatabaseClient
  logger: Logger
  passwordHasher: PasswordHasher
  jwtSigner: JwtSigner
  jwtVerifier: JwtVerifier
  unitOfWork: AuthUnitOfWork
}

/**
 * Composition root: единственное место, где создаётся «железо».
 * Асинхронный — импорт ES256-ключей (jose) идёт через SubtleCrypto.
 */
export const createContainer = async (env: Env = loadEnv()): Promise<Container> => {
  const sql = createDatabaseClient(env)

  return {
    env,
    sql,
    logger: createLogger(env),
    passwordHasher: argon2PasswordHasher,
    jwtSigner: await JwtSigner(env.JWT_PRIVATE_KEY, env.JWT_KID, {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }),
    jwtVerifier: await JwtVerifier(env.JWT_PUBLIC_KEY, env.JWT_KID, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }),
    unitOfWork: createAuthUnitOfWork(sql),
  }
}
