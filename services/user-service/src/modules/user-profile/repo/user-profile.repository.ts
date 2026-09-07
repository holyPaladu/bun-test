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
  createIfAbsent(userId: string): Promise<void>
  findById(userId: string): Promise<UserProfile | null>
  update(userId: string, input: UpdateUserProfileInput): Promise<UserProfile | null>
}

export const UserProfileRepository = (sql: DatabaseClient): UserProfileRepository => ({
  createIfAbsent: async userId => {
    await sql`
      INSERT INTO user_profiles (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `
  },

  findById: async userId => {
    const [row] = await sql<UserProfileRow[]>`
      SELECT user_id, display_name, avatar_url, locale, timezone, created_at, updated_at
      FROM user_profiles
      WHERE user_id = ${userId}
    `

    return row ? toUserProfile(row) : null
  },

  update: async (userId, input) => {
    const hasDisplayName = Object.hasOwn(input, 'displayName')
    const hasAvatarUrl = Object.hasOwn(input, 'avatarUrl')
    const hasLocale = Object.hasOwn(input, 'locale')
    const hasTimezone = Object.hasOwn(input, 'timezone')

    const [row] = await sql<UserProfileRow[]>`
      UPDATE user_profiles SET
        display_name = CASE WHEN ${hasDisplayName} THEN ${input.displayName ?? null}
                            ELSE display_name END,
        avatar_url = CASE WHEN ${hasAvatarUrl} THEN ${input.avatarUrl ?? null}
                          ELSE avatar_url END,
        locale = CASE WHEN ${hasLocale} THEN ${input.locale ?? null}
                      ELSE locale END,
        timezone = CASE WHEN ${hasTimezone} THEN ${input.timezone ?? null}
                        ELSE timezone END,
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING user_id, display_name, avatar_url, locale, timezone, created_at, updated_at
    `

    return row ? toUserProfile(row) : null
  },
})
