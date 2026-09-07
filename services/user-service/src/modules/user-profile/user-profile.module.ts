import type { Container } from '@/container'
import { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { UserProfileRoutes } from '@/modules/user-profile/user-profile.routes'
import { GetMyProfileUseCase } from '@/modules/user-profile/use-cases/get-my-profile'
import { UpdateMyProfileUseCase } from '@/modules/user-profile/use-cases/update-my-profile'

/** Собирает profile repository, use cases и HTTP routes. */
export const createUserProfileModule = (
  container: Pick<Container, 'sql' | 'jwtVerifier' | 'unitOfWork'>,
) => {
  const userProfileRepository = UserProfileRepository(container.sql)

  return UserProfileRoutes({
    jwtVerifier: container.jwtVerifier,
    getMyProfile: GetMyProfileUseCase({ unitOfWork: container.unitOfWork }),
    updateMyProfile: UpdateMyProfileUseCase({ userProfileRepository }),
  })
}
