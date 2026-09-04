export interface User {
  id: string
  email: string
  passwordHash: string
  status: 'active' | 'blocked'
  createdAt: Date
  updatedAt: Date
}

export interface UserRow {
  id: string
  email: string
  password_hash: string
  status: 'active' | 'blocked'
  created_at: Date
  updated_at: Date
}

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})