import type { UserProfileRepository } from '../repo/user-profile.repository'

export interface CreateUserProfileInput {
  userId: string
}

export const createCreateUserProfileUseCase = (deps: {
  userProfiles: Pick<UserProfileRepository, 'createIfAbsent'>
}) => async ({ userId }: CreateUserProfileInput): Promise<void> => {
  await deps.userProfiles.createIfAbsent(userId)
}

export type CreateUserProfile = ReturnType<typeof createCreateUserProfileUseCase>
