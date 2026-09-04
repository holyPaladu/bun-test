import { DatabaseClient } from "@/shared/database/client"
import { RefreshTokenRepository } from "../repo/refresh-token.repository"
import { RefreshTokenGenerator } from "@/shared/lib/token/refresh-token"
import { NotFoundError, UnauthorizedError } from "@/shared/errors/app-error"

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
      if (storedToken.revokedAt) throw new UnauthorizedError("Refresh token has been revoked")
      if (storedToken.expiresAt < new Date()) throw new UnauthorizedError("Refresh token has expired")

      await tokenRepo.revoke(storedToken.id)
    })
  }

export type Logout = ReturnType<typeof LogoutUseCase>