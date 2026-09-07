export const AUTH_ACCOUNT_STATUSES = ['active', 'blocked'] as const
export type AuthAccountStatus = typeof AUTH_ACCOUNT_STATUSES[number]

export interface AuthAccount {
  id: string
  email: string
  passwordHash: string
  authStatus: AuthAccountStatus
  createdAt: Date
  updatedAt: Date
}

export interface AuthAccountRow {
  id: string
  email: string
  password_hash: string
  auth_status: AuthAccountStatus
  created_at: Date
  updated_at: Date
}

export const toAuthAccount = (row: AuthAccountRow): AuthAccount => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  authStatus: row.auth_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})
