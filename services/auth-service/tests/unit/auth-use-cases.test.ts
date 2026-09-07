import { describe, expect, mock, test } from 'bun:test'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'
import { LoginAccountUseCase } from '@/modules/auth/use-cases/login-account'
import { RegisterAccountUseCase } from '@/modules/auth/use-cases/register-account'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { AuthAccountBlockedError, UnauthorizedError } from '@/shared/errors/app-error'

const activeAccount = (overrides: Partial<AuthAccount> = {}): AuthAccount => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
  passwordHash: 'stored-hash',
  authStatus: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const repository = (overrides: Partial<AuthRepository> = {}): AuthRepository => ({
  insert: mock(async () => activeAccount()),
  findByEmail: mock(async () => null),
  findById: mock(async () => null),
  setNewPasswordHash: mock(async () => true),
  ...overrides,
})

const hasher = (valid = true): PasswordHasher => ({
  hash: mock(async password => `hashed:${password}`),
  verify: mock(async () => valid),
})

describe('RegisterAccountUseCase', () => {
  test('normalizes the email, hashes the password, and stores no plaintext', async () => {
    const repo = repository()
    const passwordHasher = hasher()
    const register = RegisterAccountUseCase({ authRepository: repo, passwordHasher })

    await register({ email: '  USER@Example.COM ', password: 'secret-123' })

    expect(passwordHasher.hash).toHaveBeenCalledWith('secret-123')
    expect(repo.insert).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed:secret-123',
    })
  })

  test('does not insert when password hashing fails', async () => {
    const repo = repository()
    const passwordHasher: PasswordHasher = {
      hash: mock(async () => { throw new Error('hash failed') }),
      verify: mock(async () => false),
    }
    const register = RegisterAccountUseCase({ authRepository: repo, passwordHasher })

    await expect(register({ email: 'user@example.com', password: 'secret-123' }))
      .rejects.toThrow('hash failed')
    expect(repo.insert).not.toHaveBeenCalled()
  })
})

describe('LoginAccountUseCase', () => {
  const input = { email: ' USER@Example.COM ', password: 'secret-123' }
  const meta = { ip: '127.0.0.1', userAgent: 'test-agent' }

  test('issues tokens for an active account with a valid password', async () => {
    const repo = repository({ findByEmail: mock(async () => activeAccount()) })
    const passwordHasher = hasher(true)
    const issueTokens = mock(async () => ({ accessToken: 'access', refreshToken: 'refresh' }))
    const login = LoginAccountUseCase({ authRepository: repo, passwordHasher, issueTokens })

    await expect(login(input, meta)).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    expect(repo.findByEmail).toHaveBeenCalledWith('user@example.com')
    expect(passwordHasher.verify).toHaveBeenCalledWith('secret-123', 'stored-hash')
    expect(issueTokens).toHaveBeenCalledWith(activeAccount().id, meta)
  })

  test('rejects an unknown account without checking the password', async () => {
    const passwordHasher = hasher()
    const login = LoginAccountUseCase({
      authRepository: repository(),
      passwordHasher,
      issueTokens: mock(async () => ({ accessToken: '', refreshToken: '' })),
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects a blocked account before checking the password', async () => {
    const passwordHasher = hasher()
    const login = LoginAccountUseCase({
      authRepository: repository({
        findByEmail: mock(async () => activeAccount({ authStatus: 'blocked' })),
      }),
      passwordHasher,
      issueTokens: mock(async () => ({ accessToken: '', refreshToken: '' })),
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(AuthAccountBlockedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects an invalid password and does not issue tokens', async () => {
    const issueTokens = mock(async () => ({ accessToken: '', refreshToken: '' }))
    const login = LoginAccountUseCase({
      authRepository: repository({ findByEmail: mock(async () => activeAccount()) }),
      passwordHasher: hasher(false),
      issueTokens,
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(issueTokens).not.toHaveBeenCalled()
  })
})
