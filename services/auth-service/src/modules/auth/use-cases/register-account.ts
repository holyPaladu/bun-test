import type { RegisterBody } from '@/modules/auth/schemas/auth.schemas'
import { createAccountCreatedEvent } from '@/modules/integration-events/events'
import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { normalizeEmail } from '@/shared/utils/normalizer'

interface RegisterAccountDeps {
  unitOfWork: AuthUnitOfWork
  passwordHasher: PasswordHasher
}

export const RegisterAccountUseCase = ({
  unitOfWork,
  passwordHasher,
}: RegisterAccountDeps) =>
  async (input: RegisterBody): Promise<void> => {
    const email = normalizeEmail(input.email)
    const passwordHash = await passwordHasher.hash(input.password)

    await unitOfWork.run(async ({ authAccounts, outboxEvents }) => {
      const account = await authAccounts.insert({ email, passwordHash })
      await outboxEvents.insert(createAccountCreatedEvent(account.id), account.id)
    })
  }

export type RegisterAccount = ReturnType<typeof RegisterAccountUseCase>
