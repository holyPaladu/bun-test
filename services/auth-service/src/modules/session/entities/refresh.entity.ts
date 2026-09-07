export interface RefreshToken {
  id: string
  sessionId: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
  ipAddress: string | null
  userAgent: string | null
  lastUsedAt: Date | null
  replacedBy: string | null
}

export interface RefreshTokenRow {
  id: string
  session_id: string
  user_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
  updated_at: Date
  revoked_at: Date | null
  ip_address: string | null
  user_agent: string | null
  last_used_at: Date | null
  replaced_by: string | null
}

export const toRefreshToken = (row: RefreshTokenRow): RefreshToken => ({
  id: row.id,
  sessionId: row.session_id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  lastUsedAt: row.last_used_at,
  replacedBy: row.replaced_by,
})
