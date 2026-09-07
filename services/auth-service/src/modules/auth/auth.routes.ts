import { Elysia } from 'elysia'
import { ErrorResponseSchemas } from '@/shared/errors/error-response.schema'
import { createAuthGuard } from '@/shared/http/guard/auth.guard'
import type { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'
import { AuthSchemas } from '@/modules/auth/schemas/auth.schemas'
import type { LoginUser } from '@/modules/auth/use-cases/login-user'
import type { RegisterUser } from '@/modules/auth/use-cases/register-user'
import type { RotateTokens } from '@/modules/session/use-cases/rotate-tokens'
import type { Logout } from '@/modules/session/use-cases/logout'
import type { LogoutAll } from '@/modules/session/use-cases/logout-all'
import { GetSessions } from '../session/use-cases/get-sessions'
import { RevokeSessionByUserId } from '../session/use-cases/revoke-session-by-user-id'
import { ChangePassword } from './use-cases/change-password'

export interface AuthRoutesDeps {
  registerUser: RegisterUser
  loginUser: LoginUser
  refreshToken: RotateTokens
  logout: Logout
  logoutAll: LogoutAll
  jwtVerifier: JwtVerifier
  getSessions: GetSessions
  revokeSessionByUserId: RevokeSessionByUserId
  changePasswordInside: ChangePassword
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
          201: 'messageResponseSchema',
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
          200: 'messageResponseSchema',
          404: 'errorResponseSchema',
          422: 'errorResponseSchema',
        },
      }
    )
    .group('', app => app
      .use(createAuthGuard(deps.jwtVerifier))
      .post(
        '/logout-all',
        async ({ user }) => {
          await deps.logoutAll(user.userId)
          return { message: 'Logged out from all sessions successfully' }
        },
        {
          response: {
            200: 'messageResponseSchema',
            401: 'errorResponseSchema',
          },
          detail: {
            security: [{ bearerAuth: [] }],
          },
        }
      )
      .get(
        '/sessions',
        async ({ user, query }) => {
          const data = await deps.getSessions(user.userId, query)
          return {
            items: data.items,
            pagination: {
              perPage: query.perPage,
              page: query.page,
              total: data.pagination.total,
              hasMore: data.pagination.hasMore,
            }
          }
        },
        {
          query: 'paginationBodySchema',
          response: {
            200: 'getSessionsResponseSchema',
            401: 'errorResponseSchema',
          },
          detail: {
            security: [{ bearerAuth: [] }],
          },
        }
      )
      .delete(
        '/session/:id',
        async ({ user, params, set }) => {
          await deps.revokeSessionByUserId(params.id, user.userId, 'user_revoked')
          set.status = 204
        },
        {
          params: 'paramsIdSchema',
          response: {
            204: 'voidResponseSchema',
            401: 'errorResponseSchema',
            404: 'errorResponseSchema',
          },
          detail: {
            security: [{ bearerAuth: [] }],
          },
        }
      )
      .put(
        '/change-password',
        async ({ user, body, set }) => {
          await deps.changePasswordInside(user.userId, body)
          set.status = 204
        },
        {
          body: 'changePasswordBodySchema',
          response: {
            204: 'voidResponseSchema',
            401: 'errorResponseSchema',
            422: 'errorResponseSchema'
          }
        }
      )
    )
