import type { User } from '@/modules/auth/entities/user.entity'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { RegisterBody } from '@/modules/auth/schemas/auth.schemas'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'

interface RegisterUserDeps {
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
}

export const RegisterUserUseCase = ({ authRepository, passwordHasher }: RegisterUserDeps) =>
  async (input: RegisterBody): Promise<User> => {
    const passwordHash = await passwordHasher.hash(input.password)

    return authRepository.insert({ email: input.email, passwordHash })
  }

export type RegisterUser = ReturnType<typeof RegisterUserUseCase>
