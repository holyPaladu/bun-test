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
