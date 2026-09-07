import type { DatabaseClient } from '@/shared/database/client'
import { isUniqueViolation } from '@/shared/errors/db-error'
import { AlreadyExistsError } from '@/shared/errors/app-error'
import type { User, UserRow } from '@/modules/auth/entities/user.entity'
import { toUser } from '@/modules/auth/entities/user.entity'

export interface AuthRepository {
  insert(input: { email: string; passwordHash: string }): Promise<Partial<User>>
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
}

/** Postgres-специфичные детали (коды ошибок) не выходят за пределы репозитория. */
export const AuthRepository = (sql: DatabaseClient): AuthRepository => ({
  insert: async ({ email, passwordHash }) => {
    try {
      const [row] = await sql<UserRow[]>`
        INSERT INTO users (email, password_hash)
        VALUES (${email}, ${passwordHash})
        RETURNING id, email, password_hash, status, created_at, updated_at
      `
      return toUser(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AlreadyExistsError("User")
      throw error
    }
  },

  findByEmail: async (email) => {
    const [row] = await sql<UserRow[]>`
      SELECT id, email, password_hash, status, created_at, updated_at
      FROM users
      WHERE email = ${email}
    `
    return row ? toUser(row) : null
  },

  findById: async (id) => {
    const [row] = await sql<UserRow[]>`
      SELECT id, email, password_hash, status, created_at, updated_at
      FROM users
      WHERE id = ${id}
    `
    return row ? toUser(row) : null
  }
})
