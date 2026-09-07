import { describe, expect, mock, test } from 'bun:test'
import type { RefreshTokenRepository } from '@/modules/session/repo/refresh-token.repository'
import type { SessionRepository } from '@/modules/session/repo/session.repository'
import { GetSessionsUseCase } from '@/modules/session/use-cases/get-sessions'
import { IssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { RevokeSessionByUserIdUseCase } from '@/modules/session/use-cases/revoke-session-by-user-id'
import type { RefreshTokenGenerator } from '@/shared/lib/token/refresh-token'

const userId = '00000000-0000-4000-8000-000000000001'
const sessionId = '00000000-0000-4000-8000-000000000002'
const now = new Date('2026-01-01T00:00:00.000Z')

const session = {
  id: sessionId,
  userId,
  createdAt: now,
  absoluteExpiresAt: new Date('2026-04-01T00:00:00.000Z'),
  lastSeenAt: now,
  ipAddress: null,
  userAgent: null,
  revokedAt: null,
  revokedReason: null,
}

const sessionRepository = (overrides: Partial<SessionRepository> = {}): SessionRepository => ({
  insert: mock(async () => session),
  findById: mock(async () => session),
  revoke: mock(async () => {}),
  revokeAllByUserId: mock(async () => {}),
  touch: mock(async () => {}),
  findAllByUserId: mock(async () => ({
    items: [session], pagination: { total: 1, limit: 10, offset: 0, hasMore: false },
  })),
  revokeSessionByUserId: mock(async () => true),
  ...overrides,
})

describe('IssueTokensUseCase', () => {
  test('creates a session and stores only the refresh-token hash', async () => {
    const sessions = sessionRepository()
    const refreshTokens = {
      insert: mock(async input => ({ id: 'token-id', createdAt: now, revokedAt: null,
        lastUsedAt: null, replacedBy: null, ipAddress: input.ip, userAgent: input.userAgent,
        sessionId: input.sessionId, userId: input.userId, tokenHash: input.tokenHash,
        expiresAt: input.expiresAt })),
      findByTokenHash: mock(async () => null),
      findByTokenHashForUpdate: mock(async () => null),
      revoke: mock(async () => true),
    } satisfies RefreshTokenRepository
    const generator: RefreshTokenGenerator = {
      generate: mock(() => 'raw-refresh-token'),
      hash: mock(token => `hash:${token}`),
    }
    const signer = { sign: mock(async () => 'signed-access-token') }
    const issue = IssueTokensUseCase({
      sessionRepository: sessions,
      refreshTokenRepository: refreshTokens,
      jwtSigner: signer,
      refreshTokenGenerator: generator,
      refreshTokenTtlDays: 30,
      sessionAbsoluteTtlDays: 90,
    })

    const before = Date.now()
    await expect(issue(userId, { ip: '127.0.0.1', userAgent: 'agent' })).resolves.toEqual({
      accessToken: 'signed-access-token', refreshToken: 'raw-refresh-token',
    })
    const after = Date.now()

    expect(sessions.insert).toHaveBeenCalledTimes(1)
    const sessionInput = (sessions.insert as ReturnType<typeof mock>).mock.calls[0][0]
    expect(sessionInput).toMatchObject({ userId, ip: '127.0.0.1', userAgent: 'agent' })
    expect(sessionInput.absoluteExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 90 * 86_400_000)
    expect(sessionInput.absoluteExpiresAt.getTime()).toBeLessThanOrEqual(after + 90 * 86_400_000)
    expect(signer.sign).toHaveBeenCalledWith({ subject: userId, sessionId })
    expect(generator.hash).toHaveBeenCalledWith('raw-refresh-token')
    expect(refreshTokens.insert).toHaveBeenCalledWith(expect.objectContaining({
      sessionId, userId, tokenHash: 'hash:raw-refresh-token', ip: '127.0.0.1', userAgent: 'agent',
    }))
  })

  test('caps refresh expiry at the absolute session expiry', async () => {
    const sessions = sessionRepository()
    const insert = mock(async (input: Parameters<RefreshTokenRepository['insert']>[0]) => ({
      ...input, id: 'token-id', createdAt: now, revokedAt: null, lastUsedAt: null,
      replacedBy: null, ipAddress: input.ip, userAgent: input.userAgent,
    }))
    const issue = IssueTokensUseCase({
      sessionRepository: sessions,
      refreshTokenRepository: {
        insert,
        findByTokenHash: mock(async () => null),
        findByTokenHashForUpdate: mock(async () => null),
        revoke: mock(async () => true),
      },
      jwtSigner: { sign: mock(async () => 'access') },
      refreshTokenGenerator: { generate: () => 'refresh', hash: value => `hash:${value}` },
      refreshTokenTtlDays: 30,
      sessionAbsoluteTtlDays: 2,
    })

    await issue(userId, { ip: null, userAgent: null })
    expect(insert.mock.calls[0][0].expiresAt).toEqual(
      (sessions.insert as ReturnType<typeof mock>).mock.calls[0][0].absoluteExpiresAt,
    )
  })
})

describe('session query use-cases', () => {
  test('translates page/perPage into limit/offset', async () => {
    const repository = sessionRepository()
    const getSessions = GetSessionsUseCase({ sessionRepo: repository })

    await getSessions(userId, { page: 3, perPage: 20 })

    expect(repository.findAllByUserId).toHaveBeenCalledWith(userId, { limit: 20, offset: 40 })
  })

  test('revokes only a session owned by the current user', async () => {
    const repository = sessionRepository()
    const revoke = RevokeSessionByUserIdUseCase({ sessionRepo: repository })

    await revoke(sessionId, userId, 'user_revoked')

    expect(repository.revokeSessionByUserId).toHaveBeenCalledWith(sessionId, userId, 'user_revoked')
  })

  test('throws when the owned active session does not exist', async () => {
    const revoke = RevokeSessionByUserIdUseCase({
      sessionRepo: sessionRepository({ revokeSessionByUserId: mock(async () => false) }),
    })

    await expect(revoke(sessionId, userId, 'user_revoked')).rejects.toThrow()
  })
})
