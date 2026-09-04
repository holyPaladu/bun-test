import { DatabaseClient } from "@/shared/database/client"
import { RefreshTokenRepository } from "../repo/refresh-token.repository"
import { RefreshTokenGenerator } from "@/shared/lib/token/refresh-token"
import { NotFoundError } from "@/shared/errors/app-error"

export interface LogoutUseCaseDeps {
  sql: DatabaseClient
  refreshTokenGenerator: RefreshTokenGenerator
}

export const LogoutUseCase = (deps: LogoutUseCaseDeps) => 
  async (refreshToken: string): Promise<void> =>{
    await deps.sql.begin(async (tx) => {
      const tokenRepo = RefreshTokenRepository(tx)
      const tokenHash = deps.refreshTokenGenerator.hash(refreshToken)

      const storedToken = await tokenRepo.findByTokenHash(tokenHash)
      if (!storedToken) throw new NotFoundError("Refresh token")

      await tokenRepo.revoke(storedToken.id)
    })
  }

export type Logout = ReturnType<typeof LogoutUseCase>