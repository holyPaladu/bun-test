import { describe, expect, mock, test } from 'bun:test'
import { t } from 'elysia'
import { Value } from '@sinclair/typebox/value'
import {
  accountCreatedV1Schema,
  type AccountCreatedV1,
} from '@test-project/integration-event-contracts'
import type { AuthAccount } from '@/modules/auth/entities/auth-account.entity'
import { createLoginAccountUseCase } from '@/modules/auth/use-cases/login-account'
import { createRegisterAccountUseCase } from '@/modules/auth/use-cases/register-account'
import type { PasswordHasher } from '@/shared/lib/hash/argon2-password-hasher'
import { AuthAccountBlockedError, UnauthorizedError } from '@/shared/errors/app-error'
import { createInMemoryDatabase } from '../helpers/in-memory-database'
import { createAuthUnitOfWork } from '@/shared/database/auth-unit-of-work'

const activeAccount = (overrides: Partial<AuthAccount> = {}): AuthAccount => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
  passwordHash: 'stored-hash',
  authStatus: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

type AuthAccounts = Parameters<typeof createLoginAccountUseCase>[0]['authAccounts']

const repository = (overrides: Partial<AuthAccounts> = {}): AuthAccounts => ({
  findByEmail: mock(async () => null),
  ...overrides,
})

const hasher = (valid = true): PasswordHasher => ({
  hash: mock(async password => `hashed:${password}`),
  verify: mock(async () => valid),
})

describe('RegisterAccountUseCase', () => {
  test('normalizes the email, hashes the password, and stores no plaintext', async () => {
    const database = createInMemoryDatabase()
    const passwordHasher = hasher()
    const register = createRegisterAccountUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      passwordHasher,
    })

    await register({ email: '  USER@Example.COM ', password: 'secret-123' })

    expect(passwordHasher.hash).toHaveBeenCalledWith('secret-123')
    expect(database.authAccounts[0]).toMatchObject({
      email: 'user@example.com', password_hash: 'hashed:secret-123',
    })
    expect(database.outboxEvents).toHaveLength(1)
    expect(database.outboxEvents[0]).toMatchObject({
      event_type: 'auth.account-created.v1',
      aggregate_id: database.authAccounts[0].id,
      payload: {
        type: 'auth.account-created.v1',
        data: { userId: database.authAccounts[0].id },
      },
    })
    expect(database.outboxEvents[0].payload).toEqual({
      eventId: expect.any(String),
      type: 'auth.account-created.v1',
      occurredAt: expect.any(String),
      data: { userId: database.authAccounts[0].id },
    })
    expect(Value.Check(
      t.Unsafe<AccountCreatedV1>(accountCreatedV1Schema),
      database.outboxEvents[0].payload,
    )).toBe(true)
  })

  test('does not insert when password hashing fails', async () => {
    const database = createInMemoryDatabase()
    const passwordHasher: PasswordHasher = {
      hash: mock(async () => { throw new Error('hash failed') }),
      verify: mock(async () => false),
    }
    const register = createRegisterAccountUseCase({
      unitOfWork: createAuthUnitOfWork(database.sql),
      passwordHasher,
    })

    await expect(register({ email: 'user@example.com', password: 'secret-123' }))
      .rejects.toThrow('hash failed')
    expect(database.authAccounts).toHaveLength(0)
    expect(database.outboxEvents).toHaveLength(0)
  })
})

describe('LoginAccountUseCase', () => {
  const input = { email: ' USER@Example.COM ', password: 'secret-123' }
  const meta = { ip: '127.0.0.1', userAgent: 'test-agent' }

  test('issues tokens for an active account with a valid password', async () => {
    const repo = repository({ findByEmail: mock(async () => activeAccount()) })
    const passwordHasher = hasher(true)
    const issueTokens = mock(async () => ({ accessToken: 'access', refreshToken: 'refresh' }))
    const login = createLoginAccountUseCase({ authAccounts: repo, passwordHasher, issueTokens })

    await expect(login(input, meta)).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    expect(repo.findByEmail).toHaveBeenCalledWith('user@example.com')
    expect(passwordHasher.verify).toHaveBeenCalledWith('secret-123', 'stored-hash')
    expect(issueTokens).toHaveBeenCalledWith(activeAccount().id, meta)
  })

  test('rejects an unknown account without checking the password', async () => {
    const passwordHasher = hasher()
    const login = createLoginAccountUseCase({
      authAccounts: repository(),
      passwordHasher,
      issueTokens: mock(async () => ({ accessToken: '', refreshToken: '' })),
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })

  test('rejects a blocked account before checking the password', async () => {
    const passwordHasher = hasher()
    const login = createLoginAccountUseCase({
      authAccounts: repository({
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
    const login = createLoginAccountUseCase({
      authAccounts: repository({ findByEmail: mock(async () => activeAccount()) }),
      passwordHasher: hasher(false),
      issueTokens,
    })

    await expect(login(input, meta)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(issueTokens).not.toHaveBeenCalled()
  })
})
