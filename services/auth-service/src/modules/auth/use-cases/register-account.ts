import { createAccountCreatedEvent } from '@/modules/auth/events/create-account-created.event'
import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface RegisterAccountDeps {
  unitOfWork: AuthUnitOfWork
  passwordHasher: PasswordHasher
}

export interface RegisterAccountInput {
  email: string
  password: string
}

export const createRegisterAccountUseCase = ({
  unitOfWork,
  passwordHasher,
}: RegisterAccountDeps) =>
  async (input: RegisterAccountInput): Promise<void> => {
    const email = normalizeEmail(input.email)
    const passwordHash = await passwordHasher.hash(input.password)

    await unitOfWork.run(async ({ authAccounts, outboxEvents }) => {
      const account = await authAccounts.insert({ email, passwordHash })
      await outboxEvents.append(createAccountCreatedEvent(account.id), account.id)
    })
  }

export type RegisterAccount = ReturnType<typeof createRegisterAccountUseCase>
