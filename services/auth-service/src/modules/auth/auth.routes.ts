import { Elysia } from 'elysia'
import { ErrorResponseSchemas } from '@/shared/errors/error-response.schema'
import { AuthSchemas } from '@/modules/auth/schemas/auth.schemas'
import type { LoginUser } from '@/modules/auth/use-cases/login-user'
import type { RegisterUser } from '@/modules/auth/use-cases/register-user'
import { RefreshToken } from '@/modules/auth//use-cases/refresh-token'

export interface AuthRoutesDeps {
  registerUser: RegisterUser
  loginUser: LoginUser
  refreshToken: RefreshToken
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
