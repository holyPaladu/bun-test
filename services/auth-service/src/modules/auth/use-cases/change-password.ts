import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { changePasswordBody } from '../schemas/auth.schemas'
import { UnauthorizedError } from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'

export interface ChangePasswordDeps {
  unitOfWork: AuthUnitOfWork
  authRepository: AuthRepository
  passwordHasher: PasswordHasher
}

export const ChangePasswordUseCase = ({
  unitOfWork,
  authRepository,
  passwordHasher,
}: ChangePasswordDeps) =>
  async (userId: string, { oldPassword, newPassword }: changePasswordBody) => {
    const storedAccount = await authRepository.findById(userId)
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

export type ChangePassword = ReturnType<typeof ChangePasswordUseCase>
