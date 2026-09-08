import type { Container } from '@/container'
import { ACCOUNT_CREATED_V1 } from '@test-project/integration-event-contracts'
import { createPostgresUserProfileRepository } from './repo/postgres-user-profile.repository'
import { createUserProfileRoutes } from './http/user-profile.routes'
import { createGetMyProfileUseCase } from './use-cases/get-my-profile'
import { createUpdateMyProfileUseCase } from './use-cases/update-my-profile'
import { onAccountCreated } from './events/on-account-created'

/** Собирает profile repository, use cases и HTTP routes. */
export const createUserProfileModule = (
  container: Pick<Container, 'sql' | 'jwtVerifier'>,
) => {
  const userProfiles = createPostgresUserProfileRepository(container.sql)

  return {
    routes: createUserProfileRoutes({
      jwtVerifier: container.jwtVerifier,
      getMyProfile: createGetMyProfileUseCase({ userProfiles }),
      updateMyProfile: createUpdateMyProfileUseCase({ userProfiles }),
    }),
    integrationEventHandlers: {
      [ACCOUNT_CREATED_V1]: onAccountCreated,
    },
  }
}
