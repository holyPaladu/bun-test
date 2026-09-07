import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { NotFoundError } from '@/shared/errors/app-error'

interface GetMyProfileDeps {
  userProfileRepository: UserProfileRepository
}

export const GetMyProfileUseCase = ({ userProfileRepository }: GetMyProfileDeps) =>
  async (userId: string): Promise<UserProfile> => {
    const profile = await userProfileRepository.findById(userId)
    if (!profile) throw new NotFoundError('User profile')
    return profile
  }

export type GetMyProfile = ReturnType<typeof GetMyProfileUseCase>
