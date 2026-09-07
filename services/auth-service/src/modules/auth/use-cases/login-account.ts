import { AuthAccountBlockedError, UnauthorizedError } from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import type { Meta } from '@/shared/types/meta.type'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { LoginBody, LoginResponse } from '@/modules/auth/schemas/auth.schemas'
import type { IssueTokens } from '@/modules/session/use-cases/issue-tokens'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface LoginAccountDeps {
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
  issueTokens: IssueTokens
}

export const LoginAccountUseCase = ({
  authRepository,
  passwordHasher,
  issueTokens,
}: LoginAccountDeps) =>
  async (input: LoginBody, meta: Meta): Promise<LoginResponse> => {
    const email = normalizeEmail(input.email)
    const account = await authRepository.findByEmail(email)
    if (!account) throw new UnauthorizedError()
    if (account.authStatus !== 'active') throw new AuthAccountBlockedError()

    const passwordMatches = await passwordHasher.verify(input.password, account.passwordHash)
    if (!passwordMatches) throw new UnauthorizedError()

    return issueTokens(account.id, meta)
  }

export type LoginAccount = ReturnType<typeof LoginAccountUseCase>
