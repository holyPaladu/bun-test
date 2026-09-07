import { loadEnv, type Env } from '@/shared/config/env'
import { createDatabaseClient, type DatabaseClient } from '@/shared/database/client'
import { createUserUnitOfWork, type UserUnitOfWork } from '@/shared/database/user-unit-of-work'
import { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import { createLogger, type Logger } from '@/shared/lib/logger/logger'

export interface Container {
  env: Env
  sql: DatabaseClient
  logger: Logger
  jwtVerifier: JwtVerifier
  unitOfWork: UserUnitOfWork
}

/** Composition root: единственное место, где создаётся runtime-инфраструктура. */
export const createContainer = (env: Env = loadEnv()): Container => {
  const sql = createDatabaseClient(env)

  return {
    env,
    sql,
    logger: createLogger(env),
    unitOfWork: createUserUnitOfWork(sql),
    jwtVerifier: JwtVerifier({
      jwksUrl: env.AUTH_JWKS_URL,
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
      timeoutMs: env.AUTH_JWKS_TIMEOUT_MS,
      clockToleranceSec: env.AUTH_JWT_CLOCK_TOLERANCE_SEC,
    }),
  }
}
