import type { Container } from '@/container'
import { createAuthRepository } from '@/modules/auth/repo/auth.repository'
import { createAuthRoutes } from '@/modules/auth/http/auth.routes'
import { createChangePasswordUseCase } from '@/modules/auth/use-cases/change-password'
import { createLoginAccountUseCase } from '@/modules/auth/use-cases/login-account'
import { createRegisterAccountUseCase } from '@/modules/auth/use-cases/register-account'
import { createSessionModule } from '@/modules/session/session.module'

/** Собирает auth repository, use cases и HTTP routes. */
export const createAuthModule = (container: Pick<
  Container,
  'sql' | 'passwordHasher' | 'jwtSigner' | 'jwtVerifier' | 'unitOfWork' | 'env'
>) => {
  const authAccounts = createAuthRepository(container.sql)
  const session = createSessionModule(container)

  return createAuthRoutes({
    registerAccount: createRegisterAccountUseCase({
      unitOfWork: container.unitOfWork,
      passwordHasher: container.passwordHasher,
    }),
    loginAccount: createLoginAccountUseCase({
      authAccounts,
      passwordHasher: container.passwordHasher,
      issueTokens: session.issueTokens,
    }),
    refreshToken: session.rotateTokens,
    logout: session.logout,
    logoutAll: session.logoutAll,
    jwtVerifier: container.jwtVerifier,
    getSessions: session.getSessions,
    revokeSessionByUserId: session.revokeSessionByUserId,
    changePassword: createChangePasswordUseCase({
      unitOfWork: container.unitOfWork,
      authAccounts,
      passwordHasher: container.passwordHasher,
    }),
  })
}
