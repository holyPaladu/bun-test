import { describe, expect, mock, test } from 'bun:test'
import type { AuthRepository } from '@/modules/auth/repo/auth.repository'
import type { User } from '@/modules/auth/entities/user.entity'
import { LoginUserUseCase } from '@/modules/auth/use-cases/login-user'
import { RegisterUserUseCase } from '@/modules/auth/use-cases/register-user'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { UnauthorizedError, UserBlockedError } from '@/shared/errors/app-error'

const activeUser = (overrides: Partial<User> = {}): User => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
  passwordHash: 'stored-hash',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const repository = (overrides: Partial<AuthRepository> = {}): AuthRepository => ({
  insert: mock(async () => activeUser()),
  findByEmail: mock(async () => null),
  findById: mock(async () => null),
  setNewPasswordHash: mock(async () => true),
  ...overrides,
})

const hasher = (valid = true): PasswordHasher => ({
  hash: mock(async password => `hashed:${password}`),
  verify: mock(async () => valid),
})

describe('RegisterUserUseCase', () => {
  test('normalizes the email, hashes the password, and stores no plaintext', async () => {
    const repo = repository()
    const passwordHasher = hasher()
    const register = RegisterUserUseCase({ authRepository: repo, passwordHasher })

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
    const register = RegisterUserUseCase({ authRepository: repo, passwordHasher })

    await expect(register({ email: 'user@example.com', password: 'secret-123' }))
      .rejects.toThrow('hash failed')
    expect(repo.insert).not.toHaveBeenCalled()
  })
})

describe('LoginUserUseCase', () => {
  const input = { email: ' USER@Example.COM ', password: 'secret-123' }
  const meta = { ip: '127.0.0.1', userAgent: 'test-agent' }

  test('issues tokens for an active user with a valid password', async () => {
    const repo = repository({ findByEmail: mock(async () => activeUser()) })
    const passwordHasher = hasher(true)
    const issueTokens = mock(async () => ({ accessToken: 'access', refreshToken: 'refresh' }))
    const login = LoginUserUseCase({ authRepository: repo, passwordHasher, issueTokens })

    await expect(login(input, meta)).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    expect(repo.findByEmail).toHaveBeenCalledWith('user@example.com')
    expect(passwordHasher.verify).toHaveBeenCalledWith('secret-123', 'stored-hash')
    expect(issueTokens).toHaveBeenCalledWith(activeUser().id, meta)
  })

  test('rejects an unknown user without checking the password', async () => {
    const passwordHasher = hasher()
    const login = LoginUserUseCase({
      authRepository: repository(),
      passwordHasher,
      issueTokens: mock(async () => ({ accessToken: '', refreshToken: '' })),
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects a blocked user before checking the password', async () => {
    const passwordHasher = hasher()
    const login = LoginUserUseCase({
      authRepository: repository({
        findByEmail: mock(async () => activeUser({ status: 'blocked' })),
      }),
      passwordHasher,
      issueTokens: mock(async () => ({ accessToken: '', refreshToken: '' })),
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UserBlockedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects an invalid password and does not issue tokens', async () => {
    const issueTokens = mock(async () => ({ accessToken: '', refreshToken: '' }))
    const login = LoginUserUseCase({
      authRepository: repository({ findByEmail: mock(async () => activeUser()) }),
      passwordHasher: hasher(false),
      issueTokens,
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(issueTokens).not.toHaveBeenCalled()
  })
})
