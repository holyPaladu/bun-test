import { t } from 'elysia'

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
  accessToken: t.String(),
  refreshToken: t.String(),
})

export type LoginResponse = typeof loginResponseSchema.static

export const refreshTokenBodySchema = t.Object({
  refreshToken: t.String(),
})

export type RefreshTokenBody = typeof refreshTokenBodySchema.static

export const refreshTokenResponseSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.String(),
})

export type RefreshTokenResponse = typeof refreshTokenResponseSchema.static

export const AuthSchemas = {
  registerBodySchema,
  registerResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshTokenResponseSchema,
}