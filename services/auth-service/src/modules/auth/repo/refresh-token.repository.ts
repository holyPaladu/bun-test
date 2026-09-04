import type { DatabaseClient } from '@/shared/database/client'
import type { RefreshToken, RefreshTokenRow } from '@/modules/auth/entities/refresh.entity'
import { toRefreshToken } from '@/modules/auth/entities/refresh.entity'

export interface RefreshTokenRepository {
  insert(input: { userId: string; tokenHash: string; expiresAt: Date, ip: string | null, userAgent: string | null }): Promise<RefreshToken>
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>
  revoke(tokenId: string, newTokenId: string): Promise<void>
}

export const RefreshTokenRepository = (sql: DatabaseClient): RefreshTokenRepository => ({
  insert: async ({ userId, tokenHash, expiresAt, ip, userAgent }) => {
    const [row] = await sql<RefreshTokenRow[]>`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
      VALUES (${userId}, ${tokenHash}, ${expiresAt}, ${ip}, ${userAgent})
      RETURNING id, user_id, token_hash, expires_at, created_at, revoked_at, ip_address, user_agent, last_used_at, replaced_by
    `

    return toRefreshToken(row)
  },

  findByTokenHash: async (tokenHash) => {
    const [row] = await sql<RefreshTokenRow[]>`
      SELECT id, user_id, token_hash, expires_at, created_at, revoked_at, ip_address, user_agent, last_used_at, replaced_by
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
    `
    return row ? toRefreshToken(row) : null
  },

  revoke: async (tokenId, newTokenId) => {
    await sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW(), last_used_at = NOW(), replaced_by = ${newTokenId}
      WHERE id = ${tokenId}
    `
  }
})
