import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/modules/user-profile/repo/user-profile.repository'

interface UpdateMyProfileDeps {
  userProfileRepository: UserProfileRepository
}

export const UpdateMyProfileUseCase = ({ userProfileRepository }: UpdateMyProfileDeps) =>
  (userId: string, input: UpdateUserProfileInput): Promise<UserProfile> =>
    userProfileRepository.update(userId, input)

export type UpdateMyProfile = ReturnType<typeof UpdateMyProfileUseCase>
