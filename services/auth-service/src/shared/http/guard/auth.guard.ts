import { Elysia } from 'elysia'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { JwtVerifier } from '@/shared/lib/jwt/jwt-verifier'

/** Ровно то, что IssueTokensUseCase кладёт в access-token (см. issue-tokens.ts). */
export interface AuthGuardUser {
  userId: string
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
      const [scheme, token] = headers.authorization?.split(' ') ?? []
      if (scheme !== 'Bearer' || !token) throw new UnauthorizedError('Missing bearer token')

      try {
        return { user: (await jwtVerifier.verify(token)) as unknown as AuthGuardUser }
      } catch {
        throw new UnauthorizedError('Invalid or expired token')
      }
    })
