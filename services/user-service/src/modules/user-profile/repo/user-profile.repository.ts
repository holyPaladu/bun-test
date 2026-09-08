import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'

export interface UserProfileRepository {
  createIfAbsent(userId: string): Promise<void>
  findById(userId: string): Promise<UserProfile | null>
  update(
    userId: string,
    changes: Partial<Pick<UserProfile, 'displayName' | 'avatarUrl' | 'locale' | 'timezone'>>,
  ): Promise<UserProfile | null>
}
