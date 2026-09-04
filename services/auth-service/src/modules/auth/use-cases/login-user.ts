import { NotFoundError, UnauthorizedError, UserBlockedError } from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { JwtSigner } from '@/shared/lib/jwt/jwt-signer'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import type { meta } from '@/shared/types/meta.type'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { RefreshTokenRepository } from '@/modules/auth/repo/refresh-token.repository'
import type { LoginBody, LoginResponse } from '@/modules/auth/schemas/auth.schemas'

interface LoginUserDeps {
  authRepository: AuthRepository
  refreshTokenRepository: RefreshTokenRepository
  passwordHasher: PasswordHasher
  jwtSigner: JwtSigner
  refreshTokenGenerator: RefreshTokenGenerator
  refreshTokenTtlDays: number
}

export const LoginUserUseCase = ({
  authRepository,
  refreshTokenRepository,
  passwordHasher,
  jwtSigner,
  refreshTokenGenerator,
  refreshTokenTtlDays,
}: LoginUserDeps) =>
  async (input: LoginBody, meta: meta): Promise<LoginResponse> => {
    const existUser = await authRepository.findByEmail(input.email)
    if (!existUser) throw new NotFoundError("User")

    if (existUser.status !== 'active') throw new UserBlockedError()

    const isMatch = await passwordHasher.verify(input.password, existUser.passwordHash)
    if (!isMatch) throw new UnauthorizedError()

    const [accessToken, refreshToken] = await Promise.all([
      jwtSigner.sign({ userId: existUser.id }),
      (async () => {
        const refreshToken = refreshTokenGenerator.generate()
        await refreshTokenRepository.insert({
          userId: existUser.id,
          tokenHash: refreshTokenGenerator.hash(refreshToken),
          expiresAt: new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000),
          ...meta
        })
        return refreshToken
      })(),
    ])

    return { accessToken, refreshToken }
}


export type LoginUser = ReturnType<typeof LoginUserUseCase>
