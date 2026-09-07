import type { DatabaseClient } from '@/shared/database/client'
import { NotFoundError, UnauthorizedError, UserBlockedError } from '@/shared/errors/app-error'
import type { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { meta } from '@/shared/types/meta.type'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { SessionRepository } from '@/modules/session/repo/session.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import type { IssuedTokens } from '@/modules/session/use-cases/issue-tokens'

export interface RotateTokensDeps {
  sql: DatabaseClient
  authRepository: AuthRepository
  sessionRepository: SessionRepository
  refreshTokenRepository: RefreshTokenRepository
  jwtSigner: JwtSigner
  refreshTokenGenerator: RefreshTokenGenerator
  refreshTokenTtlDays: number
}

/**
 * Ротация refresh-токена. Ключевая проверка — reuse detection: если предъявленный
 * токен уже был отмечен revoked_at (то есть эта же секретная строка уже участвовала
 * в предыдущей ротации), значит текущий запрос — повторное использование украденного
 * значения. В этом случае убиваем не токен (он и так мёртв), а всю сессию, чтобы
 * оборвать и уже выданный атакующему следующий токен из цепочки.
 */
export const RotateTokensUseCase = ({
  sql,
  authRepository,
  sessionRepository,
  refreshTokenRepository,
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
}: RotateTokensDeps) =>
  async (refreshToken: string, meta: meta): Promise<IssuedTokens> => {
    const tokenHash = refreshTokenGenerator.hash(refreshToken)
    const storedToken = await refreshTokenRepository.findByTokenHash(tokenHash)
    if (!storedToken) throw new UnauthorizedError()

    const session = await sessionRepository.findById(storedToken.sessionId)
    if (!session || session.revokedAt) throw new UnauthorizedError()

    if (storedToken.revokedAt) {
      await sessionRepository.revoke(session.id, 'reuse_detected')
      throw new UnauthorizedError('Refresh token reuse detected')
    }

    if (storedToken.expiresAt < new Date()) throw new UnauthorizedError()

    const user = await authRepository.findById(storedToken.userId)
    if (!user) throw new NotFoundError('User')
    if (user.status !== 'active') throw new UserBlockedError()

    const accessToken = await jwtSigner.sign({ userId: storedToken.userId })
    const newRefreshToken = refreshTokenGenerator.generate()

    await sql.begin(async (tx) => {
      const tokenRepo = RefreshTokenRepository(tx)
      const token = await tokenRepo.insert({
        sessionId: session.id,
        userId: storedToken.userId,
        tokenHash: refreshTokenGenerator.hash(newRefreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000),
        ...meta,
      })
      await tokenRepo.revoke(storedToken.id, token.id)
      await sessionRepository.touch(session.id, meta)
    })

    return { accessToken, refreshToken: newRefreshToken }
  }

export type RotateTokens = ReturnType<typeof RotateTokensUseCase>
