import { describe, expect, mock, test } from 'bun:test'
import { createGetSessionsUseCase } from '@/modules/session/use-cases/get-sessions'
import { createIssueTokensUseCase } from '@/modules/session/use-cases/issue-tokens'
import { createRevokeSessionByUserIdUseCase } from '@/modules/session/use-cases/revoke-session-by-user-id'
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

type Sessions = Parameters<typeof createIssueTokensUseCase>[0]['sessions']
  & Parameters<typeof createGetSessionsUseCase>[0]['sessions']
  & Parameters<typeof createRevokeSessionByUserIdUseCase>[0]['sessions']

const sessionRepository = (overrides: Partial<Sessions> = {}): Sessions => ({
  insert: mock(async () => session),
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
    }
    const generator: RefreshTokenGenerator = {
      generate: mock(() => 'raw-refresh-token'),
      hash: mock(token => `hash:${token}`),
    }
    const signer = { sign: mock(async () => 'signed-access-token') }
    const issue = createIssueTokensUseCase({
      sessions,
      refreshTokens,
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
    const insert = mock(async (
      input: Parameters<Parameters<typeof createIssueTokensUseCase>[0]['refreshTokens']['insert']>[0],
    ) => ({
      ...input, id: 'token-id', createdAt: now, revokedAt: null, lastUsedAt: null,
      replacedBy: null, ipAddress: input.ip, userAgent: input.userAgent,
    }))
    const issue = createIssueTokensUseCase({
      sessions,
      refreshTokens: {
        insert,
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
    const getSessions = createGetSessionsUseCase({ sessions: repository })

    await getSessions(userId, { page: 3, perPage: 20 })

    expect(repository.findAllByUserId).toHaveBeenCalledWith(userId, { limit: 20, offset: 40 })
  })

  test('revokes only a session owned by the current user', async () => {
    const repository = sessionRepository()
    const revoke = createRevokeSessionByUserIdUseCase({ sessions: repository })

    await revoke(sessionId, userId, 'user_revoked')

    expect(repository.revokeSessionByUserId).toHaveBeenCalledWith(sessionId, userId, 'user_revoked')
  })

  test('throws when the owned active session does not exist', async () => {
    const revoke = createRevokeSessionByUserIdUseCase({
      sessions: sessionRepository({ revokeSessionByUserId: mock(async () => false) }),
    })

    await expect(revoke(sessionId, userId, 'user_revoked')).rejects.toThrow()
  })
})
