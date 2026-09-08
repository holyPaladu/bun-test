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
