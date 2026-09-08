import type { Container } from '@/container'
import { createUserProfileRepository } from './repo/user-profile.repository'
import { createUserProfileRoutes } from './http/user-profile.routes'
import { createGetMyProfileUseCase } from './use-cases/get-my-profile'
import { createUpdateMyProfileUseCase } from './use-cases/update-my-profile'

/** Собирает profile repository, use cases и HTTP routes. */
export const createUserProfileModule = (
  container: Pick<Container, 'sql' | 'jwtVerifier'>,
) => {
  const userProfiles = createUserProfileRepository(container.sql)

  return createUserProfileRoutes({
    jwtVerifier: container.jwtVerifier,
    getMyProfile: createGetMyProfileUseCase({ userProfiles }),
    updateMyProfile: createUpdateMyProfileUseCase({ userProfiles }),
  })
}
