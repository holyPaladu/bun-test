import { JwtSigner } from "@/shared/lib/jwt/jwt-signer"
import { RefreshTokenGenerator } from "@/shared/lib/token/refresh-token"
import type { meta } from '@/shared/types/meta.type'
import { RefreshTokenRepository } from "../repo/refresh-token.repository"
import { AuthRepository } from "../repo/auth.repository"
import { RefreshTokenResponse } from "../schemas/auth.schemas"
import { NotFoundError, UnauthorizedError, UserBlockedError } from "@/shared/errors/app-error"
import { DatabaseClient } from "@/shared/database/client"

export interface RefreshTokenDeps {
  sql: DatabaseClient
  authRepository: AuthRepository
  refreshTokenRepository: RefreshTokenRepository
  jwtSigner: JwtSigner
  refreshTokenGenerator: RefreshTokenGenerator
  refreshTokenTtlDays: number
}

export const RefreshTokenUseCase = ({
  sql,
  authRepository,
  refreshTokenRepository,
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
}: RefreshTokenDeps) =>
  async (refreshToken: string, meta: meta): Promise<RefreshTokenResponse> => {

    const tokenHash = refreshTokenGenerator.hash(refreshToken)
    const storedToken = await refreshTokenRepository.findByTokenHash(tokenHash)
    
    if (!storedToken) throw new UnauthorizedError()
    if (storedToken.revokedAt) throw new UnauthorizedError()
    if (storedToken.expiresAt < new Date()) throw new UnauthorizedError()

    const userFind = await authRepository.findById(storedToken.userId)
    if (!userFind) throw new NotFoundError("User")
    if (userFind.status !== 'active') throw new UserBlockedError()

    const accessToken = await jwtSigner.sign({ userId: storedToken.userId })
    const newRefreshToken = refreshTokenGenerator.generate()

    await sql.begin(async (tx) => {
      const tokenRepo = RefreshTokenRepository(tx)
      const token = await tokenRepo.insert({
        userId: storedToken.userId,
        tokenHash: refreshTokenGenerator.hash(newRefreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000),
        ...meta
      })
      await tokenRepo.revoke(storedToken.id, token.id)
    })

    return { accessToken, refreshToken: newRefreshToken }
  }

export type RefreshToken = ReturnType<typeof RefreshTokenUseCase>