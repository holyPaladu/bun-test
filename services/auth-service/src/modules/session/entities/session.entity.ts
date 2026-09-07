export const SESSION_REVOKED_REASONS = [
    'logout',           // выход с текущего устройства через refresh token
    'user_revoked',     // пользователь вручную отключил конкретное устройство
    'logout_all',       // выход со всех устройств
    'reuse_detected',   // обнаружено повторное использование refresh token
    'session_limit',    // удалена из-за лимита сессий
    'password_change'   // изменение после смены пароля
  ] as const

export type SessionRevokedReason =
  (typeof SESSION_REVOKED_REASONS)[number]


export interface Session {
  id: string
  userId: string
  createdAt: Date
  absoluteExpiresAt: Date
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
  absolute_expires_at: Date
  last_seen_at: Date | null
  ip_address: string | null
  user_agent: string | null
  revoked_at: Date | null
  revoked_reason: SessionRevokedReason | null
}

export type RevokedSession = {
  id: string
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
