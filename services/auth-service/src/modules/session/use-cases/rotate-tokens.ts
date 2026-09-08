import type { AuthUnitOfWork } from '@/shared/database/auth-unit-of-work'
import {
  AuthAccountBlockedError,
  NotFoundError,
  UnauthorizedError,
} from '@/shared/errors/app-error'
import type { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { Meta } from '@/shared/types/meta.type'
import type { IssuedTokens } from '@/modules/session/use-cases/issue-tokens'

export interface RotateTokensDeps {
  unitOfWork: AuthUnitOfWork
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
export const createRotateTokensUseCase = ({
  unitOfWork,
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
}: RotateTokensDeps) =>
  async (refreshToken: string, meta: Meta): Promise<IssuedTokens> => {
    const tokenHash = refreshTokenGenerator.hash(refreshToken)
    const tokens = await unitOfWork.run(async (repositories): Promise<IssuedTokens | null> => {
      const storedToken = await repositories.refreshTokens.findByTokenHashForUpdate(tokenHash)
      if (!storedToken) throw new UnauthorizedError()

      const session = await repositories.sessions.findById(storedToken.sessionId)
      if (!session || session.revokedAt) throw new UnauthorizedError()

      if (storedToken.revokedAt) {
        await repositories.sessions.revoke(session.id, 'reuse_detected')
        // Ошибку бросаем после транзакции, иначе отзыв сессии откатится.
        return null
      }

      const now = new Date()
      if (session.absoluteExpiresAt <= now || storedToken.expiresAt <= now) {
        throw new UnauthorizedError()
      }

      const account = await repositories.authAccounts.findById(storedToken.userId)
      if (!account) throw new NotFoundError('Auth account')
      if (account.authStatus !== 'active') throw new AuthAccountBlockedError()

      const accessToken = await jwtSigner.sign({ subject: storedToken.userId, sessionId: session.id })
      const newRefreshToken = refreshTokenGenerator.generate()
      const token = await repositories.refreshTokens.insert({
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

      const revoked = await repositories.refreshTokens.revoke(storedToken.id, token.id)
      if (!revoked) throw new UnauthorizedError('Refresh token reuse detected')

      await repositories.sessions.touch(session.id, meta)
      return { accessToken, refreshToken: newRefreshToken }
    })

    if (!tokens) throw new UnauthorizedError('Refresh token reuse detected')
    return tokens
  }

export type RotateTokens = ReturnType<typeof createRotateTokensUseCase>
