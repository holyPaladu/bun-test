import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/modules/user-profile/repo/user-profile.repository'
import { NotFoundError } from '@/shared/errors/app-error'

interface UpdateMyProfileDeps {
  userProfileRepository: UserProfileRepository
}

export const UpdateMyProfileUseCase = ({ userProfileRepository }: UpdateMyProfileDeps) =>
  async (userId: string, input: UpdateUserProfileInput): Promise<UserProfile> => {
    const profile = await userProfileRepository.update(userId, input)
    if (!profile) throw new NotFoundError('User profile')
    return profile
  }

export type UpdateMyProfile = ReturnType<typeof UpdateMyProfileUseCase>
