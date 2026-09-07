import { Elysia } from 'elysia'
import { ErrorResponseSchemas } from '@/shared/errors/error-response.schema'
import { createAuthGuard } from '@/shared/http/guard/auth.guard'
import type { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import { UserProfileSchemas } from '@/modules/user-profile/schemas/user-profile.schemas'
import type { GetMyProfile } from '@/modules/user-profile/use-cases/get-my-profile'
import type { UpdateMyProfile } from '@/modules/user-profile/use-cases/update-my-profile'

export interface UserProfileRoutesDeps {
  jwtVerifier: JwtVerifier
  getMyProfile: GetMyProfile
  updateMyProfile: UpdateMyProfile
}

export const UserProfileRoutes = (deps: UserProfileRoutesDeps) =>
  new Elysia({ prefix: '/users', tags: ['users'] })
    .model(UserProfileSchemas)
    .model(ErrorResponseSchemas)
    .use(createAuthGuard(deps.jwtVerifier))
    .get(
      '/me',
      async ({ user }) => deps.getMyProfile(user.userId),
      {
        response: {
          200: 'userProfileResponseSchema',
          401: 'errorResponseSchema',
          404: 'errorResponseSchema',
          503: 'errorResponseSchema',
        },
        detail: { security: [{ bearerAuth: [] }] },
      },
    )
    .patch(
      '/me',
      async ({ user, body }) => deps.updateMyProfile(user.userId, body),
      {
        body: 'updateMyProfileBodySchema',
        response: {
          200: 'userProfileResponseSchema',
          401: 'errorResponseSchema',
          404: 'errorResponseSchema',
          422: 'errorResponseSchema',
          503: 'errorResponseSchema',
        },
        detail: { security: [{ bearerAuth: [] }] },
      },
    )
