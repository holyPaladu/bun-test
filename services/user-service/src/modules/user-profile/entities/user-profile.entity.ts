export interface UserProfile {
  id: string
  displayName: string | null
  avatarUrl: string | null
  locale: string | null
  timezone: string | null
  createdAt: Date
  updatedAt: Date
}

export interface UserProfileRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  locale: string | null
  timezone: string | null
  created_at: Date
  updated_at: Date
}

export const toUserProfile = (row: UserProfileRow): UserProfile => ({
  id: row.user_id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  locale: row.locale,
  timezone: row.timezone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})
