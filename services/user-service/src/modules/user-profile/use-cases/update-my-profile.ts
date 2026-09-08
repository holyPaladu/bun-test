import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { NotFoundError } from '@/shared/errors/app-error'

interface UpdateMyProfileDeps {
  userProfiles: Pick<UserProfileRepository, 'update'>
}

export interface UpdateMyProfileInput {
  userId: string
  displayName?: string | null
  avatarUrl?: string | null
  locale?: string | null
  timezone?: string | null
}

export const createUpdateMyProfileUseCase = ({ userProfiles }: UpdateMyProfileDeps) =>
  async ({ userId, ...changes }: UpdateMyProfileInput): Promise<UserProfile> => {
    const profile = await userProfiles.update(userId, changes)
    if (!profile) throw new NotFoundError('User profile')
    return profile
  }

export type UpdateMyProfile = ReturnType<typeof createUpdateMyProfileUseCase>
