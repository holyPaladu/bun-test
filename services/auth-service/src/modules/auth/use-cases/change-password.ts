import { PasswordHasher } from "@/shared/lib/hash/argon2-password-hasher"
import { AuthRepository } from "../repo/auth.repository"
import type { changePasswordBody } from '../schemas/auth.schemas'
import { UnauthorizedError } from "@/shared/errors/app-error"
import { DatabaseClient } from "@/shared/database/client"
import { SessionRepository } from "@/modules/session/repo/session.repository"

export interface ChangePasswordDeps {
  sql: DatabaseClient
  authRepo: AuthRepository,
  passwordHasher: PasswordHasher
}

export const ChangePasswordUseCase = ({ sql, authRepo, passwordHasher }: ChangePasswordDeps) => 
  async (userId: string, { oldPassword, newPassword }: changePasswordBody) => {
    const storedUser = await authRepo.findById(userId)
    if (!storedUser) 
      throw new UnauthorizedError()
    if (!(await passwordHasher.verify(oldPassword, storedUser.passwordHash)))
      throw new UnauthorizedError()

    const newHash = await passwordHasher.hash(newPassword)

    await sql.begin(async (tx) => {
      const repo = AuthRepository(tx)
      const sesssionRepo = SessionRepository(tx)

      await repo.setNewPasswordHash(userId, newHash, storedUser.passwordHash)
      await sesssionRepo.revokeAllByUserId(userId, 'password_change')
    })
  }

export type ChangePassword = ReturnType<typeof ChangePasswordUseCase>