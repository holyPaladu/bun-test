import type { DatabaseClient } from '@/shared/database/client'
import type { RefreshToken } from '@/modules/session/entities/refresh.entity'
import { toRefreshToken, type RefreshTokenRow } from './refresh-token.mapper'

export interface RefreshTokenRepository {
  insert(input: {
    sessionId: string
    userId: string
    tokenHash: string
    expiresAt: Date
    ip: string | null
    userAgent: string | null
  }): Promise<RefreshToken>
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>
  findByTokenHashForUpdate(tokenHash: string): Promise<RefreshToken | null>
  revoke(tokenId: string, newTokenId?: string | null): Promise<boolean>
}

export const createRefreshTokenRepository = (sql: DatabaseClient): RefreshTokenRepository => ({
  insert: async ({ sessionId, userId, tokenHash, expiresAt, ip, userAgent }) => {
    const [row] = await sql<RefreshTokenRow[]>`
      INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at, ip_address, user_agent)
      VALUES (${sessionId}, ${userId}, ${tokenHash}, ${expiresAt}, ${ip}, ${userAgent})
      RETURNING id, session_id, user_id, token_hash, expires_at, created_at, revoked_at, ip_address, user_agent, last_used_at, replaced_by
    `

    return toRefreshToken(row)
  },

  findByTokenHash: async (tokenHash) => {
    const [row] = await sql<RefreshTokenRow[]>`
      SELECT id, session_id, user_id, token_hash, expires_at, created_at, revoked_at, ip_address, user_agent, last_used_at, replaced_by
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
    `
    return row ? toRefreshToken(row) : null
  },

  findByTokenHashForUpdate: async (tokenHash) => {
    const [row] = await sql<RefreshTokenRow[]>`
      SELECT id, session_id, user_id, token_hash, expires_at, created_at, revoked_at, ip_address, user_agent, last_used_at, replaced_by
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `
    return row ? toRefreshToken(row) : null
  },

  revoke: async (tokenId, newTokenId = null) => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE refresh_tokens
      SET revoked_at = NOW(), last_used_at = NOW(), replaced_by = ${newTokenId}
      WHERE id = ${tokenId} AND revoked_at IS NULL
      RETURNING id
    `

    return !!row
  },
})
