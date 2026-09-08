export interface CreateUserProfileInput {
  userId: string
}

export const createCreateUserProfileUseCase = (deps: {
  userProfiles: { createIfAbsent(userId: string): Promise<void> }
}) => async ({ userId }: CreateUserProfileInput): Promise<void> => {
  await deps.userProfiles.createIfAbsent(userId)
}

export type CreateUserProfile = ReturnType<typeof createCreateUserProfileUseCase>
