import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { RegisterBody } from '@/modules/auth/schemas/auth.schemas'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface RegisterAccountDeps {
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
}

export const RegisterAccountUseCase = ({
  authRepository,
  passwordHasher,
}: RegisterAccountDeps) =>
  async (input: RegisterBody): Promise<void> => {
    const email = normalizeEmail(input.email)
    const passwordHash = await passwordHasher.hash(input.password)

    await authRepository.insert({ email, passwordHash })
  }

export type RegisterAccount = ReturnType<typeof RegisterAccountUseCase>
