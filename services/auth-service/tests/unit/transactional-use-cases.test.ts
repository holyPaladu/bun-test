import { describe, expect, mock, test } from 'bun:test'
import { AuthRepository } from '@/modules/auth/repo/auth.repository'
import { toAuthAccount } from '@/modules/auth/entities/auth-account.entity'
import type { AuthAccountRow } from '@/modules/auth/entities/auth-account.entity'
import type { RefreshTokenRow } from '@/modules/session/entities/refresh.entity'
import type { SessionRow } from '@/modules/session/entities/session.entity'
import { ChangePasswordUseCase } from '@/modules/auth/use-cases/change-password'
import { LogoutAllUseCase } from '@/modules/session/use-cases/logout-all'
import { LogoutUseCase } from '@/modules/session/use-cases/logout'
import { RotateTokensUseCase } from '@/modules/session/use-cases/rotate-tokens'
import {
  AuthAccountBlockedError,
  NotFoundError,
  UnauthorizedError,
} from '@/shared/errors/app-error'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'
import { createInMemoryDatabase } from '../helpers/in-memory-database'
import { createAuthUnitOfWork } from '@/shared/database/auth-unit-of-work'

const userId = '00000000-0000-4000-8000-000000000001'
const sessionId = '00000000-0000-4000-8000-000000000002'
const refreshTokenId = '00000000-0000-4000-8000-000000000003'
const day = 86_400_000

const authAccountRow = (
  overrides: Partial<AuthAccountRow> = {},
): AuthAccountRow => ({
  id: userId,
  email: 'user@example.com',
  password_hash: 'hash:old-password',
  auth_status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

const sessionRow = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: sessionId,
  user_id: userId,
  created_at: new Date(),
  absolute_expires_at: new Date(Date.now() + 30 * day),
  last_seen_at: new Date(),
  ip_address: null,
  user_agent: null,
  revoked_at: null,
  revoked_reason: null,
  ...overrides,
})

const refreshRow = (overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow => ({
  id: refreshTokenId,
  session_id: sessionId,
  user_id: userId,
  token_hash: 'hash:raw-refresh',
  expires_at: new Date(Date.now() + 10 * day),
  created_at: new Date(),
  updated_at: new Date(),
  revoked_at: null,
  ip_address: null,
  user_agent: null,
  last_used_at: null,
  replaced_by: null,
  ...overrides,
})

const generator = (): RefreshTokenGenerator => ({
  generate: mock(() => 'new-raw-refresh'),
  hash: mock(token => `hash:${token}`),
})

describe('ChangePasswordUseCase', () => {
  const hasher = (isValid = true): PasswordHasher => ({
    hash: mock(async password => `hash:${password}`),
    verify: mock(async () => isValid),
  })

  test('rejects a missing auth account', async () => {
    const database = createInMemoryDatabase()
    const passwordHasher = hasher()
    const changePassword = ChangePasswordUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      authRepository: AuthRepository(database.sql),
      passwordHasher,
    })

    await expect(changePassword(userId, {
      oldPassword: 'old-password', newPassword: 'new-password',
    })).rejects.toBeInstanceOf(UnauthorizedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects an incorrect current password without writing', async () => {
    const database = createInMemoryDatabase()
    database.authAccounts.push(authAccountRow())
    const passwordHasher = hasher(false)
    const changePassword = ChangePasswordUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      authRepository: AuthRepository(database.sql),
      passwordHasher,
    })

    await expect(changePassword(userId, {
      oldPassword: 'wrong-password', newPassword: 'new-password',
    })).rejects.toBeInstanceOf(UnauthorizedError)
    expect(passwordHasher.hash).not.toHaveBeenCalled()
    expect(database.authAccounts[0].password_hash).toBe('hash:old-password')
  })

  test('changes the hash and revokes every active session in one transaction', async () => {
    const database = createInMemoryDatabase()
    database.authAccounts.push(authAccountRow())
    database.sessions.push(sessionRow(), sessionRow({
      id: '00000000-0000-4000-8000-000000000004',
    }))
    const passwordHasher = hasher(true)
    const changePassword = ChangePasswordUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      authRepository: AuthRepository(database.sql),
      passwordHasher,
    })

    await changePassword(userId, {
      oldPassword: 'old-password', newPassword: 'new-password',
    })

    expect(passwordHasher.verify).toHaveBeenCalledWith('old-password', 'hash:old-password')
    expect(passwordHasher.hash).toHaveBeenCalledWith('new-password')
    expect(database.authAccounts[0].password_hash).toBe('hash:new-password')
    expect(database.sessions.every(row => row.revoked_reason === 'password_change')).toBe(true)
  })

  test('does not revoke sessions when a concurrent password update wins', async () => {
    const database = createInMemoryDatabase()
    database.authAccounts.push(authAccountRow({ password_hash: 'hash:concurrent-password' }))
    database.sessions.push(sessionRow())

    const authRepository = AuthRepository(database.sql)
    authRepository.findById = mock(async () => toAuthAccount(authAccountRow()))
    const changePassword = ChangePasswordUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      authRepository,
      passwordHasher: hasher(true),
    })

    await expect(changePassword(userId, {
      oldPassword: 'old-password',
      newPassword: 'new-password',
    })).rejects.toBeInstanceOf(UnauthorizedError)

    expect(database.authAccounts[0].password_hash).toBe('hash:concurrent-password')
    expect(database.sessions[0].revoked_at).toBeNull()
  })
})

describe('LogoutUseCase', () => {
  const setup = (session = sessionRow(), token = refreshRow()) => {
    const database = createInMemoryDatabase()
    database.sessions.push(session)
    database.refreshTokens.push(token)
    return {
      database,
      logout: LogoutUseCase({
        unitOfWork: createAuthUnitOfWork(database.sql),
        refreshTokenGenerator: generator(),
      }),
    }
  }

  test('rejects an unknown refresh token', async () => {
    const database = createInMemoryDatabase()
    const logout = LogoutUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      refreshTokenGenerator: generator(),
    })
    await expect(logout('raw-refresh')).rejects.toBeInstanceOf(NotFoundError)
  })

  test('rejects a token whose session is missing or revoked', async () => {
    const missingSession = createInMemoryDatabase()
    missingSession.refreshTokens.push(refreshRow())
    await expect(LogoutUseCase({
      unitOfWork: createAuthUnitOfWork(missingSession.sql),
      refreshTokenGenerator: generator(),
    })('raw-refresh')).rejects.toBeInstanceOf(UnauthorizedError)

    const { logout } = setup(sessionRow({ revoked_at: new Date(), revoked_reason: 'logout' }))
    await expect(logout('raw-refresh')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  test('rejects expired sessions and expired refresh tokens', async () => {
    const expiredSession = setup(sessionRow({ absolute_expires_at: new Date(Date.now() - day) }))
    await expect(expiredSession.logout('raw-refresh')).rejects.toThrow('Session has expired')

    const expiredToken = setup(sessionRow(), refreshRow({ expires_at: new Date(Date.now() - day) }))
    await expect(expiredToken.logout('raw-refresh')).rejects.toThrow('Refresh token has expired')
  })

  test('revokes the complete session for a valid token', async () => {
    const { database, logout } = setup()
    await logout('raw-refresh')
    expect(database.sessions[0].revoked_reason).toBe('logout')
  })
})

describe('LogoutAllUseCase', () => {
  test('revokes all active sessions belonging to the user', async () => {
    const database = createInMemoryDatabase()
    database.sessions.push(
      sessionRow(),
      sessionRow({ id: '00000000-0000-4000-8000-000000000004' }),
      sessionRow({ id: '00000000-0000-4000-8000-000000000005', user_id: 'another-user' }),
    )

    await LogoutAllUseCase({ sql: database.sql })(userId)

    expect(database.sessions.slice(0, 2).every(row => row.revoked_reason === 'logout_all')).toBe(true)
    expect(database.sessions[2].revoked_at).toBeNull()
  })
})

describe('RotateTokensUseCase', () => {
  const setup = (options: {
    account?: AuthAccountRow | null
    session?: SessionRow | null
    token?: RefreshTokenRow | null
  } = {}) => {
    const database = createInMemoryDatabase()
    if (options.account !== null) {
      database.authAccounts.push(options.account ?? authAccountRow())
    }
    if (options.session !== null) database.sessions.push(options.session ?? sessionRow())
    if (options.token !== null) database.refreshTokens.push(options.token ?? refreshRow())
    const refreshTokenGenerator = generator()
    const jwtSigner = { sign: mock(async () => 'new-access-token') }
    const rotate = RotateTokensUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      jwtSigner,
      refreshTokenGenerator,
      refreshTokenTtlDays: 10,
    })
    return { database, rotate, jwtSigner, refreshTokenGenerator }
  }

  test('rejects an unknown token or unavailable session', async () => {
    await expect(setup({ token: null }).rotate('raw-refresh', {
      ip: null, userAgent: null,
    })).rejects.toBeInstanceOf(UnauthorizedError)

    await expect(setup({ session: null }).rotate('raw-refresh', {
      ip: null, userAgent: null,
    })).rejects.toBeInstanceOf(UnauthorizedError)

    await expect(setup({ session: sessionRow({ revoked_at: new Date(), revoked_reason: 'logout' }) })
      .rotate('raw-refresh', { ip: null, userAgent: null }))
      .rejects.toBeInstanceOf(UnauthorizedError)
  })

  test('detects token reuse and revokes the entire session', async () => {
    const context = setup({ token: refreshRow({ revoked_at: new Date() }) })

    await expect(context.rotate('raw-refresh', { ip: null, userAgent: null }))
      .rejects.toThrow('Refresh token reuse detected')
    expect(context.database.sessions[0].revoked_reason).toBe('reuse_detected')
    expect(context.jwtSigner.sign).not.toHaveBeenCalled()
  })

  test('rejects an expired session or refresh token', async () => {
    await expect(setup({ session: sessionRow({ absolute_expires_at: new Date(Date.now() - day) }) })
      .rotate('raw-refresh', { ip: null, userAgent: null }))
      .rejects.toBeInstanceOf(UnauthorizedError)

    await expect(setup({ token: refreshRow({ expires_at: new Date(Date.now() - day) }) })
      .rotate('raw-refresh', { ip: null, userAgent: null }))
      .rejects.toBeInstanceOf(UnauthorizedError)
  })

  test('rejects a missing or blocked token owner', async () => {
    await expect(setup({ account: null }).rotate('raw-refresh', {
      ip: null, userAgent: null,
    })).rejects.toBeInstanceOf(NotFoundError)

    await expect(setup({
      account: authAccountRow({ auth_status: 'blocked' }),
    }).rotate('raw-refresh', {
      ip: null, userAgent: null,
    })).rejects.toBeInstanceOf(AuthAccountBlockedError)
  })

  test('issues a new pair, revokes the old token, and updates session metadata', async () => {
    const context = setup()

    await expect(context.rotate('raw-refresh', {
      ip: '192.0.2.1', userAgent: 'rotated-agent',
    })).resolves.toEqual({ accessToken: 'new-access-token', refreshToken: 'new-raw-refresh' })

    expect(context.jwtSigner.sign).toHaveBeenCalledWith({ subject: userId, sessionId })
    expect(context.database.refreshTokens).toHaveLength(2)
    expect(context.database.refreshTokens[0].replaced_by).toBe(context.database.refreshTokens[1].id)
    expect(context.database.refreshTokens[1]).toMatchObject({
      token_hash: 'hash:new-raw-refresh',
      ip_address: '192.0.2.1',
      user_agent: 'rotated-agent',
    })
    expect(context.database.sessions[0]).toMatchObject({
      ip_address: '192.0.2.1', user_agent: 'rotated-agent',
    })
  })
})
