import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'

export interface AuthRepository {
  insert(input: { email: string; passwordHash: string }): Promise<AuthAccount>
  findByEmail(email: string): Promise<AuthAccount | null>
  findById(id: string): Promise<AuthAccount | null>
  /** false означает, что хэш уже изменил конкурентный запрос. */
  setNewPasswordHash(
    accountId: string,
    newPasswordHash: string,
    oldPasswordHash: string,
  ): Promise<boolean>
}
