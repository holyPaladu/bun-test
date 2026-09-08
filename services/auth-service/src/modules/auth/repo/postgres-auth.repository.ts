import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'
import type { DatabaseClient } from '@/shared/database/client'
import { AlreadyExistsError } from '@/shared/errors/app-error'
import { isUniqueViolation } from '@/shared/errors/db-error'
import { toAuthAccount, type AuthAccountRow } from './auth.mapper'
import type { AuthRepository } from './auth.repository'

export const createPostgresAuthRepository = (sql: DatabaseClient): AuthRepository => ({
  insert: async ({ email, passwordHash }) => {
    try {
      const [row] = await sql<AuthAccountRow[]>`
        INSERT INTO auth_accounts (email, password_hash)
        VALUES (${email}, ${passwordHash})
        RETURNING id, email, password_hash, auth_status, created_at, updated_at
      `
      if (!row) throw new Error('Auth account insert returned no row')
      return toAuthAccount(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AlreadyExistsError('User')
      throw error
    }
  },
  findByEmail: async email => {
    const [row] = await sql<AuthAccountRow[]>`
      SELECT id, email, password_hash, auth_status, created_at, updated_at
      FROM auth_accounts WHERE email = ${email}
    `
    return row ? toAuthAccount(row) : null
  },
  findById: async id => {
    const [row] = await sql<AuthAccountRow[]>`
      SELECT id, email, password_hash, auth_status, created_at, updated_at
      FROM auth_accounts WHERE id = ${id}
    `
    return row ? toAuthAccount(row) : null
  },
  setNewPasswordHash: async (accountId, newPasswordHash, oldPasswordHash) => {
    const [row] = await sql<Pick<AuthAccount, 'id'>[]>`
      UPDATE auth_accounts
      SET password_hash = ${newPasswordHash}, updated_at = NOW()
      WHERE id = ${accountId} AND password_hash = ${oldPasswordHash}
      RETURNING id
    `
    return Boolean(row)
  },
})
