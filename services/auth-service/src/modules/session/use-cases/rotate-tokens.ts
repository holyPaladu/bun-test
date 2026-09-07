import type { DatabaseClient } from '@/shared/database/client'
import { NotFoundError, UnauthorizedError, UserBlockedError } from '@/shared/errors/app-error'
import type { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { Meta } from '@/shared/types/meta.type'
import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import { SessionRepository } from '@/modules/session/repo/session.repository'
import type { IssuedTokens } from '@/modules/session/use-cases/issue-tokens'

export interface RotateTokensDeps {
  sql: DatabaseClient
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
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
}: RotateTokensDeps) =>
  async (refreshToken: string, meta: Meta): Promise<IssuedTokens> => {
    const tokenHash = refreshTokenGenerator.hash(refreshToken)
    const tokens = await sql.begin(async (tx): Promise<IssuedTokens | null> => {
      const authRepo = AuthRepository(tx)
      const tokenRepo = RefreshTokenRepository(tx)
      const sessionRepo = SessionRepository(tx)
      const storedToken = await tokenRepo.findByTokenHashForUpdate(tokenHash)
      if (!storedToken) throw new UnauthorizedError()

      const session = await sessionRepo.findById(storedToken.sessionId)
      if (!session || session.revokedAt) throw new UnauthorizedError()

      if (storedToken.revokedAt) {
        await sessionRepo.revoke(session.id, 'reuse_detected')
        // Ошибку бросаем после транзакции, иначе отзыв сессии откатится.
        return null
      }

      const now = new Date()
      if (session.absoluteExpiresAt <= now || storedToken.expiresAt <= now) {
        throw new UnauthorizedError()
      }

      const user = await authRepo.findById(storedToken.userId)
      if (!user) throw new NotFoundError('User')
      if (user.status !== 'active') throw new UserBlockedError()

      const accessToken = await jwtSigner.sign({ userId: storedToken.userId })
      const newRefreshToken = refreshTokenGenerator.generate()
      const token = await tokenRepo.insert({
        sessionId: session.id,
        userId: storedToken.userId,
        tokenHash: refreshTokenGenerator.hash(newRefreshToken),
        expiresAt: new Date(
          Math.min(
            now.getTime() + refreshTokenTtlDays * 24 * 60 * 60 * 1000,
            session.absoluteExpiresAt.getTime(),
          ),
        ),
        ...meta,
      })

      const revoked = await tokenRepo.revoke(storedToken.id, token.id)
      if (!revoked) throw new UnauthorizedError('Refresh token reuse detected')

      await sessionRepo.touch(session.id, meta)
      return { accessToken, refreshToken: newRefreshToken }
    })

    if (!tokens) throw new UnauthorizedError('Refresh token reuse detected')
    return tokens
  }

export type RotateTokens = ReturnType<typeof RotateTokensUseCase>
