import type {
  Session,
  SessionRevokedReason,
} from '@/modules/session/entities/session.entity'

export interface SessionRow {
  id: string
  user_id: string
  created_at: Date
  absolute_expires_at: Date
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
  absoluteExpiresAt: row.absolute_expires_at,
  lastSeenAt: row.last_seen_at,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  revokedAt: row.revoked_at,
  revokedReason: row.revoked_reason,
})
