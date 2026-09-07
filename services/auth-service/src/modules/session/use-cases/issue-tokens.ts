import type { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { Meta } from '@/shared/types/meta.type'
import type { SessionRepository } from '@/modules/session/repo/session.repository'
import type { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'

export interface IssueTokensDeps {
  sessionRepository: SessionRepository
  refreshTokenRepository: RefreshTokenRepository
  jwtSigner: JwtSigner
  refreshTokenGenerator: RefreshTokenGenerator
  refreshTokenTtlDays: number
  sessionAbsoluteTtlDays: number
}

export interface IssuedTokens {
  accessToken: string
  refreshToken: string
}

/** Начало сессии: логин выдаёт первую пару access/refresh под новой session-записью. */
export const IssueTokensUseCase = ({
  sessionRepository,
  refreshTokenRepository,
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
  sessionAbsoluteTtlDays,
}: IssueTokensDeps) =>
  async (userId: string, meta: Meta): Promise<IssuedTokens> => {
    const now = Date.now()
    const absoluteExpiresAt = new Date(now + sessionAbsoluteTtlDays * 24 * 60 * 60 * 1000)
    const refreshExpiresAt = new Date(
      Math.min(now + refreshTokenTtlDays * 24 * 60 * 60 * 1000, absoluteExpiresAt.getTime()),
    )
    const session = await sessionRepository.insert({ userId, absoluteExpiresAt, ...meta })

    const [accessToken, refreshToken] = await Promise.all([
      jwtSigner.sign({ userId }),
      (async () => {
        const refreshToken = refreshTokenGenerator.generate()
        await refreshTokenRepository.insert({
          sessionId: session.id,
          userId,
          tokenHash: refreshTokenGenerator.hash(refreshToken),
          expiresAt: refreshExpiresAt,
          ...meta,
        })
        return refreshToken
      })(),
    ])

    return { accessToken, refreshToken }
  }

export type IssueTokens = ReturnType<typeof IssueTokensUseCase>
