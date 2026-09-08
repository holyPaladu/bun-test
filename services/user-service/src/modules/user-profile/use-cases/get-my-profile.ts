import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import { NotFoundError } from '@/shared/errors/app-error'

interface GetMyProfileDeps {
  userProfiles: { findById(userId: string): Promise<UserProfile | null> }
}

export interface GetMyProfileInput { userId: string }

export const createGetMyProfileUseCase = ({ userProfiles }: GetMyProfileDeps) =>
  async ({ userId }: GetMyProfileInput): Promise<UserProfile> => {
    const profile = await userProfiles.findById(userId)
    if (!profile) throw new NotFoundError('User profile')
    return profile
  }

export type GetMyProfile = ReturnType<typeof createGetMyProfileUseCase>
