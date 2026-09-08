import { AuthAccountBlockedError, UnauthorizedError } from '@/shared/errors/app-error'
import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import type { Meta } from '@/shared/types/meta.type'
import type { IssueTokens } from '@/modules/session/use-cases/issue-tokens'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface LoginAccountDeps {
  authAccounts: { findByEmail(email: string): Promise<AuthAccount | null> }
  passwordHasher: PasswordHasher
  issueTokens: IssueTokens
}

export interface LoginAccountInput { email: string; password: string }
export interface LoginAccountResult { accessToken: string; refreshToken: string }

export const createLoginAccountUseCase = ({
  authAccounts,
  passwordHasher,
  issueTokens,
}: LoginAccountDeps) =>
  async (input: LoginAccountInput, meta: Meta): Promise<LoginAccountResult> => {
    const email = normalizeEmail(input.email)
    const account = await authAccounts.findByEmail(email)
    if (!account) throw new UnauthorizedError()
    if (account.authStatus !== 'active') throw new AuthAccountBlockedError()

    const passwordMatches = await passwordHasher.verify(input.password, account.passwordHash)
    if (!passwordMatches) throw new UnauthorizedError()

    return issueTokens(account.id, meta)
  }

export type LoginAccount = ReturnType<typeof createLoginAccountUseCase>
