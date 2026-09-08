import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import { NotFoundError } from '@/shared/errors/app-error'

interface UpdateMyProfileDeps {
  userProfiles: {
    update(
      userId: string,
      changes: Omit<UpdateMyProfileInput, 'userId'>,
    ): Promise<UserProfile | null>
  }
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
