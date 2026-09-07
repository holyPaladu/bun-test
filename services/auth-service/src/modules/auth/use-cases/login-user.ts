import { UnauthorizedError, UserBlockedError } from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import type { Meta } from '@/shared/types/meta.type'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { LoginBody, LoginResponse } from '@/modules/auth/schemas/auth.schemas'
import type { IssueTokens } from '@/modules/session/use-cases/issue-tokens'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface LoginUserDeps {
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
  issueTokens: IssueTokens
}

export const LoginUserUseCase = ({ authRepository, passwordHasher, issueTokens }: LoginUserDeps) =>
  async (input: LoginBody, meta: Meta): Promise<LoginResponse> => {
    const email = normalizeEmail(input.email)
    const existUser = await authRepository.findByEmail(email)
    if (!existUser) throw new UnauthorizedError()

    if (existUser.status !== 'active') throw new UserBlockedError()

    const isMatch = await passwordHasher.verify(input.password, existUser.passwordHash)
    if (!isMatch) throw new UnauthorizedError()

    return issueTokens(existUser.id, meta)
}


export type LoginUser = ReturnType<typeof LoginUserUseCase>
