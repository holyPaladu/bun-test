import { Elysia } from 'elysia'
import { ErrorResponseSchemas } from '@/shared/errors/error-response.schema'
import { AuthSchemas } from '@/modules/auth/schemas/auth.schemas'
import type { LoginUser } from '@/modules/auth/use-cases/login-user'
import type { RegisterUser } from '@/modules/auth/use-cases/register-user'
import type { RotateTokens } from '@/modules/session/use-cases/rotate-tokens'
import type { Logout } from '@/modules/session/use-cases/logout'

export interface AuthRoutesDeps {
  registerUser: RegisterUser
  loginUser: LoginUser
  refreshToken: RotateTokens
  logout: Logout
}

export const AuthRoutes = (deps: AuthRoutesDeps) =>
  new Elysia({ prefix: '/auth', tags: ['auth'] })
    .model(AuthSchemas)
    .model(ErrorResponseSchemas)
    .post(
      '/register',
      async ({ body, set }) => {
        await deps.registerUser(body)
        set.status = 201
        return { message: 'User registered successfully' }
      },
      {
        body: 'registerBodySchema',
        response: {
          201: 'registerResponseSchema',
          409: 'errorResponseSchema',
          422: 'errorResponseSchema',
        },
      },
    )
    .post(
      '/login',
      async ({ body, request, server, headers }) => {
        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = headers['user-agent'] ?? null

        return deps.loginUser(body, { ip, userAgent })
      },
      {
        body: 'loginBodySchema',
        response: {
          200: 'loginResponseSchema',
          401: 'errorResponseSchema',
          403: 'errorResponseSchema',
          404: 'errorResponseSchema',
          422: 'errorResponseSchema',
        },
      },
    )
    .post(
      '/refresh-token',
      async ({ body, request, server, headers }) => {
        const ip = server?.requestIP(request)?.address ?? null
        const userAgent = headers['user-agent'] ?? null
        
        return deps.refreshToken(body.refreshToken, { ip, userAgent })
      },
      {
        body: 'refreshTokenBodySchema',
        response: {
          200: 'refreshTokenResponseSchema',
          401: 'errorResponseSchema',
          403: 'errorResponseSchema',
          404: 'errorResponseSchema',
          422: 'errorResponseSchema',
        },
      }
    )
    .post(
      '/logout',
      async ({ body }) => {
        await deps.logout(body.refreshToken)
        return { message: 'Logged out successfully' }
      },
      {
        body: 'refreshTokenBodySchema',
        response: {
          200: 'registerResponseSchema',
          404: 'errorResponseSchema',
          422: 'errorResponseSchema',
        },
      }
    )
