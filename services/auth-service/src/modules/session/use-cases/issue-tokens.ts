import type { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { Meta } from '@/shared/types/meta.type'
import type { Session } from '@/modules/session/entities/session.entity'

export interface IssueTokensDeps {
  sessions: {
    insert(input: {
      userId: string
      absoluteExpiresAt: Date
      ip: string | null
      userAgent: string | null
    }): Promise<Session>
  }
  refreshTokens: {
    insert(input: {
      sessionId: string
      userId: string
      tokenHash: string
      expiresAt: Date
      ip: string | null
      userAgent: string | null
    }): Promise<unknown>
  }
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
export const createIssueTokensUseCase = ({
  sessions,
  refreshTokens,
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
    const session = await sessions.insert({ userId, absoluteExpiresAt, ...meta })

    const [accessToken, refreshToken] = await Promise.all([
      jwtSigner.sign({ subject: userId, sessionId: session.id }),
      (async () => {
        const refreshToken = refreshTokenGenerator.generate()
        await refreshTokens.insert({
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

export type IssueTokens = ReturnType<typeof createIssueTokensUseCase>
