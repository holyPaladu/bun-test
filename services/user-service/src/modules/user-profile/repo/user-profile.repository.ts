import type { DatabaseClient } from '@/shared/database/client'
import {
  toUserProfile,
  type UserProfile,
  type UserProfileRow,
} from '@/modules/user-profile/entities/user-profile.entity'

export interface UpdateUserProfileInput {
  displayName?: string | null
  avatarUrl?: string | null
  locale?: string | null
  timezone?: string | null
}

export interface UserProfileRepository {
  getOrCreate(userId: string): Promise<UserProfile>
  update(userId: string, input: UpdateUserProfileInput): Promise<UserProfile>
}

export const UserProfileRepository = (sql: DatabaseClient): UserProfileRepository => ({
  getOrCreate: async (userId) => {
    await sql`
      INSERT INTO user_profiles (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `

    const [row] = await sql<UserProfileRow[]>`
      SELECT user_id, display_name, avatar_url, locale, timezone, created_at, updated_at
      FROM user_profiles
      WHERE user_id = ${userId}
    `

    if (!row) throw new Error('Profile bootstrap did not produce a row')
    return toUserProfile(row)
  },

  update: async (userId, input) => {
    const hasDisplayName = Object.hasOwn(input, 'displayName')
    const hasAvatarUrl = Object.hasOwn(input, 'avatarUrl')
    const hasLocale = Object.hasOwn(input, 'locale')
    const hasTimezone = Object.hasOwn(input, 'timezone')

    const [row] = await sql<UserProfileRow[]>`
      INSERT INTO user_profiles (user_id, display_name, avatar_url, locale, timezone)
      VALUES (
        ${userId},
        ${input.displayName ?? null},
        ${input.avatarUrl ?? null},
        ${input.locale ?? null},
        ${input.timezone ?? null}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = CASE
          WHEN ${hasDisplayName} THEN EXCLUDED.display_name
          ELSE user_profiles.display_name
        END,
        avatar_url = CASE
          WHEN ${hasAvatarUrl} THEN EXCLUDED.avatar_url
          ELSE user_profiles.avatar_url
        END,
        locale = CASE
          WHEN ${hasLocale} THEN EXCLUDED.locale
          ELSE user_profiles.locale
        END,
        timezone = CASE
          WHEN ${hasTimezone} THEN EXCLUDED.timezone
          ELSE user_profiles.timezone
        END,
        updated_at = now()
      RETURNING user_id, display_name, avatar_url, locale, timezone, created_at, updated_at
    `

    if (!row) throw new Error('Profile update returned no row')
    return toUserProfile(row)
  },
})
