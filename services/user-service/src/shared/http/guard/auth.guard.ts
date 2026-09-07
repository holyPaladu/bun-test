import { Elysia } from 'elysia'
import { AuthVerificationUnavailableError, UnauthorizedError } from '@/shared/errors/app-error'
import { JwtVerifierUnavailableError, type JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'

/** Ровно то, что IssueTokensUseCase кладёт в access-token (см. issue-tokens.ts). */
export interface AuthGuardUser {
  userId: string
  sessionId: string
}

/**
 * `scoped`, не `global` — вешается точечно на модули, которым реально
 * нужна авторизация, через `.guard()`/`.use()`, а не на всё приложение.
 * Формат самого 401-ответа не описываем здесь — это забота error-handler'а
 * (UnauthorizedError долетает до него через onError).
 */
export const createAuthGuard = (jwtVerifier: JwtVerifier) =>
  new Elysia({ name: 'auth-guard' })
    .resolve({ as: 'scoped' }, async ({ headers }) => {
      const token = /^Bearer ([^\s]+)$/.exec(headers.authorization ?? '')?.[1]
      if (!token) throw new UnauthorizedError()

      try {
        const payload = await jwtVerifier.verify(token)
        return { user: { userId: payload.sub, sessionId: payload.sid } satisfies AuthGuardUser }
      } catch (error) {
        if (error instanceof JwtVerifierUnavailableError) {
          throw new AuthVerificationUnavailableError()
        }
        throw new UnauthorizedError()
      }
    })
