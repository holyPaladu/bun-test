import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { RegisterBody } from '@/modules/auth/schemas/auth.schemas'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface RegisterUserDeps {
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
}

export const RegisterUserUseCase = ({ authRepository, passwordHasher }: RegisterUserDeps) =>
  async (input: RegisterBody): Promise<void> => {
    const email = normalizeEmail(input.email)
    const passwordHash = await passwordHasher.hash(input.password)

    await authRepository.insert({ email, passwordHash })
  }

export type RegisterUser = ReturnType<typeof RegisterUserUseCase>
