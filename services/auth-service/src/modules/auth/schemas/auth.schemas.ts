import { t } from 'elysia'
import { SESSION_REVOKED_REASONS } from '@/modules/session/entities/session.entity'

export const messageResponseSchema = t.Object({
  message: t.String(),
})

export type MessageResponse = typeof messageResponseSchema.static

export const sessionRevokeReasonSchema = t.UnionEnum(SESSION_REVOKED_REASONS)
export type sessionRevokeReason = typeof sessionRevokeReasonSchema.static

export const sessionSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  userId: t.String({ format: 'uuid' }),
  createdAt: t.Date(),
  lastSeenAt: t.Nullable(t.Date()),
  ipAddress: t.Nullable(t.String()),
  userAgent: t.Nullable(t.String()),
  revokedAt: t.Nullable(t.Date()),
  revokedReason: t.Nullable(sessionRevokeReasonSchema),
})

export type Session = typeof sessionSchema.static

export const paramsIdSchema = t.Object({ id: t.String({ format: 'uuid' })})
export type ParamsId = typeof paramsIdSchema.static

export const voidResponseSchema = t.Void()
export type voidResponse = typeof voidResponseSchema.static

// =================================

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

export const paginationBodySchema = t.Object({
  perPage: t.Number(),
  page: t.Number()
})

export type PaginationBody = typeof paginationBodySchema.static

export const getSessionsResponseSchema = t.Object({
  items: t.Array(sessionSchema),
  pagination: t.Object({
    total: t.Number(),
    perPage: t.Number(),
    page: t.Number(),
    hasMore: t.Boolean()
  })
})

export type GetSessionsResponse = typeof getSessionsResponseSchema.static

export const changePasswordBodySchema = t.Object({
  oldPassword: t.String({ minLength: 8 }),
  newPassword: t.String({ minLength: 8 }),
})
export type changePasswordBody = typeof changePasswordBodySchema.static

export const AuthSchemas = {
  messageResponseSchema,
  paramsIdSchema,
  voidResponseSchema,

  registerBodySchema,
  registerResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshTokenResponseSchema,
  paginationBodySchema,
  getSessionsResponseSchema,
  changePasswordBodySchema,
}