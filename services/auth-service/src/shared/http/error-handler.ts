import { Elysia, type ValidationError } from 'elysia'
import { isAppError } from '@/shared/errors/app-error'
import type { ErrorResponse } from '@/shared/errors/error-response.schema'
import type { Logger } from '@/shared/lib/logger/logger'

const validationDetails = (error: Readonly<ValidationError>): ErrorResponse['error']['details'] =>
  error.all.map(issue => ({
    path: 'path' in issue ? (issue.path ?? '') : '',
    message: 'message' in issue ? (issue.message ?? 'Invalid value') : 'Invalid value',
  }))

/**
 * Единственное место, где что угодно превращается в HTTP-ответ об ошибке.
 * Роуты не пишут try/catch.
 *
 * Порядок проверок важен: сначала собственные коды Elysia, потом наши
 * доменные ошибки (они приходят как code === 'UNKNOWN').
 */
export const createErrorHandler = (logger: Logger) =>
  new Elysia({ name: 'error-handler' })
    .onError(
      { as: 'global' },
      ({ code, error, set, path, request }): ErrorResponse => {
        if (code === 'VALIDATION') {
          set.status = 422
          return {
            error: {
              code: 'VALIDATION_FAILED',
              message: `Invalid ${error.type}`,
              details: validationDetails(error),
            },
          }
        }

        if (code === 'NOT_FOUND') {
          set.status = 404
          return {
            error: {
              code: 'NOT_FOUND',
              message: `Route ${request.method} ${path} not found`,
            },
          }
        }

        if (code === 'PARSE') {
          set.status = 400
          return { error: { code: 'MALFORMED_REQUEST', message: 'Request body could not be parsed' } }
        }

        if (isAppError(error)) {
          set.status = error.status
          return { error: { code: error.code, message: error.message } }
        }

        // Всё неопознанное — наша вина: логируем целиком, наружу отдаём заглушку.
        set.status = 500
        logger.error('Unhandled error', {
          code,
          path,
          method: request.method,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })

        return { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }
      }
    )
