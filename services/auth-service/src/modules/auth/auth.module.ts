import type { Container } from '@/container'
import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { AuthRoutes } from '@/modules/auth/auth.routes'
import { ChangePasswordUseCase } from '@/modules/auth/use-cases/change-password'
import { LoginAccountUseCase } from '@/modules/auth/use-cases/login-account'
import { RegisterAccountUseCase } from '@/modules/auth/use-cases/register-account'
import { createSessionModule } from '@/modules/session/session.module'

/** Собирает auth repository, use cases и HTTP routes. */
export const createAuthModule = (container: Pick<
  Container,
  'sql' | 'passwordHasher' | 'jwtSigner' | 'jwtVerifier' | 'unitOfWork' | 'env'
>) => {
  const authRepository = AuthRepository(container.sql)
  const session = createSessionModule(container)

  return AuthRoutes({
    registerAccount: RegisterAccountUseCase({
      unitOfWork: container.unitOfWork,
      passwordHasher: container.passwordHasher,
    }),
    loginAccount: LoginAccountUseCase({
      authRepository,
      passwordHasher: container.passwordHasher,
      issueTokens: session.issueTokens,
    }),
    refreshToken: session.rotateTokens,
    logout: session.logout,
    logoutAll: session.logoutAll,
    jwtVerifier: container.jwtVerifier,
    getSessions: session.getSessions,
    revokeSessionByUserId: session.revokeSessionByUserId,
    changePasswordInside: ChangePasswordUseCase({
      unitOfWork: container.unitOfWork,
      authRepository,
      passwordHasher: container.passwordHasher,
    }),
  })
}
