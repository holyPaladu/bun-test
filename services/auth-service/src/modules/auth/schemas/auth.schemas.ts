import { t } from 'elysia'

export const messageResponseSchema = t.Object({
  message: t.String(),
})

export type MessageResponse = typeof messageResponseSchema.static

export const SessionSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  userId: t.String({ format: 'uuid' }),
  createdAt: t.Date(),
  lastSeenAt: t.Nullable(t.Date()),
  ipAddress: t.Nullable(t.String()),
  userAgent: t.Nullable(t.String()),
  revokedAt: t.Nullable(t.Date()),
  revokedReason: t.Nullable(
    t.Union([
      t.Literal('logout'),
      t.Literal('logout_all'),
      t.Literal('reuse_detected'),
      t.Literal('session_limit'),
    ]),
  ),
})

export const registerBodySchema = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
})

export type RegisterBody = typeof registerBodySchema.static

export const registerResponseSchema = t.Object({
  message: t.String(),
})

export type RegisterResponse = typeof registerResponseSchema.static


export const loginBodySchema = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
})

export type LoginBody = typeof loginBodySchema.static

export const loginResponseSchema = t.Object({
  accessToken: t.String({ minLength: 1 }),
  refreshToken: t.String({ minLength: 1 }),
})

export type LoginResponse = typeof loginResponseSchema.static

export const refreshTokenBodySchema = t.Object({
  refreshToken: t.String({ minLength: 1 }),
})

export type RefreshTokenBody = typeof refreshTokenBodySchema.static

export const refreshTokenResponseSchema = t.Object({
  accessToken: t.String({ minLength: 1 }),
  refreshToken: t.String({ minLength: 1 }),
})

export type RefreshTokenResponse = typeof refreshTokenResponseSchema.static

export const PaginationBodySchema = t.Object({
  perPage: t.Number(),
  page: t.Number()
})

export type PaginationBody = typeof PaginationBodySchema.static

export const GetSessionsResponseSchema = t.Object({
  items: t.Array(SessionSchema),
  pagination: t.Object({
    total: t.Number(),
    perPage: t.Number(),
    page: t.Number(),
    hasMore: t.Boolean()
  })
})

export type GetSessionsResponse = typeof GetSessionsResponseSchema.static

export const AuthSchemas = {
  messageResponseSchema,
  registerBodySchema,
  registerResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshTokenResponseSchema,
  PaginationBodySchema,
  GetSessionsResponseSchema,
}