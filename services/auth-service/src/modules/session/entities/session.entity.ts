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
