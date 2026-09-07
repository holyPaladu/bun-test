export type SessionRevokedReason = 'logout' | 'logout_all' | 'reuse_detected' | 'session_limit'

export interface Session {
  id: string
  userId: string
  createdAt: Date
  lastSeenAt: Date | null
  ipAddress: string | null
  userAgent: string | null
  revokedAt: Date | null
  revokedReason: SessionRevokedReason | null
}

export interface SessionRow {
  id: string
  user_id: string
  created_at: Date
  last_seen_at: Date | null
  ip_address: string | null
  user_agent: string | null
  revoked_at: Date | null
  revoked_reason: SessionRevokedReason | null
}

export const toSession = (row: SessionRow): Session => ({
  id: row.id,
  userId: row.user_id,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  revokedAt: row.revoked_at,
  revokedReason: row.revoked_reason,
})
