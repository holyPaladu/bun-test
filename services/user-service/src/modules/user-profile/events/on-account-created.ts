import type { AccountCreatedV1 } from '@test-project/integration-event-contracts'
import { createCreateUserProfileUseCase } from '../use-cases/create-user-profile'
import type { UserTransactionRepositories } from '@/shared/database/user-unit-of-work'

type AccountCreatedRepositories = {
  userProfiles: Pick<UserTransactionRepositories['userProfiles'], 'createIfAbsent'>
}

export const onAccountCreated = async (
  event: AccountCreatedV1,
  repositories: AccountCreatedRepositories,
): Promise<void> => {
  const createUserProfile = createCreateUserProfileUseCase({
    userProfiles: repositories.userProfiles,
  })
  await createUserProfile({ userId: event.data.userId })
}
