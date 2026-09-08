import { t } from 'elysia'

const nullableProfileString = (options: Record<string, unknown>) =>
  t.Nullable(t.String(options))

export const userProfileResponseSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  displayName: t.Nullable(t.String()),
  avatarUrl: t.Nullable(t.String()),
  locale: t.Nullable(t.String()),
  timezone: t.Nullable(t.String()),
  createdAt: t.Date(),
  updatedAt: t.Date(),
})

export const updateMyProfileBodySchema = t.Object({
  displayName: t.Optional(nullableProfileString({ minLength: 1, maxLength: 100 })),
  avatarUrl: t.Optional(nullableProfileString({ format: 'uri', maxLength: 2048 })),
  locale: t.Optional(nullableProfileString({
    minLength: 2,
    maxLength: 35,
    pattern: '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$',
  })),
  timezone: t.Optional(nullableProfileString({
    minLength: 1,
    maxLength: 64,
    pattern: '^[A-Za-z0-9._+-]+(?:/[A-Za-z0-9._+-]+)*$',
  })),
}, { additionalProperties: false, minProperties: 1 })

export const UserProfileSchemas = { userProfileResponseSchema, updateMyProfileBodySchema }
