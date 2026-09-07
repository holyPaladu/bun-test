import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type { UserUnitOfWork } from '@/shared/database/user-unit-of-work'

interface GetMyProfileDeps {
  unitOfWork: UserUnitOfWork
}

/** Временный lazy bootstrap до появления account-created consumer-а. */
export const GetMyProfileUseCase = ({ unitOfWork }: GetMyProfileDeps) =>
  (userId: string): Promise<UserProfile> =>
    unitOfWork.run(({ userProfiles }) => userProfiles.getOrCreate(userId))

export type GetMyProfile = ReturnType<typeof GetMyProfileUseCase>
