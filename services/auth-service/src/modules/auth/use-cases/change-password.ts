import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'

export interface ChangePasswordDeps {
  unitOfWork: AuthUnitOfWork
  authAccounts: { findById(id: string): Promise<AuthAccount | null> }
  passwordHasher: PasswordHasher
}

export interface ChangePasswordInput { oldPassword: string; newPassword: string }

export const createChangePasswordUseCase = ({
  unitOfWork,
  authAccounts,
  passwordHasher,
}: ChangePasswordDeps) =>
  async (userId: string, { oldPassword, newPassword }: ChangePasswordInput) => {
    const storedAccount = await authAccounts.findById(userId)
    if (!storedAccount) throw new UnauthorizedError()
    if (!(await passwordHasher.verify(oldPassword, storedAccount.passwordHash))) {
      throw new UnauthorizedError()
    }

    const newHash = await passwordHasher.hash(newPassword)

    await unitOfWork.run(async repositories => {
      const passwordChanged = await repositories.authAccounts.setNewPasswordHash(
        userId,
        newHash,
        storedAccount.passwordHash,
      )
      if (!passwordChanged) throw new UnauthorizedError()

      await repositories.sessions.revokeAllByUserId(userId, 'password_change')
    })
  }

export type ChangePassword = ReturnType<typeof createChangePasswordUseCase>
