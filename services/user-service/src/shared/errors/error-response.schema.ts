import { t } from 'elysia'

/** Единый формат тела ошибки для всех эндпоинтов сервиса. */
export const errorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Array(t.Object({
      path: t.String(),
      message: t.String(),
    }))),
  }),
})

export type ErrorResponse = typeof errorResponseSchema.static

export const ErrorResponseSchemas = {
  errorResponseSchema,
}