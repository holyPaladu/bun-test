import type { DatabaseClient } from '@/shared/database/client'
import { PaginationInside } from '@/shared/types/meta.type';
import { PaginatedResult } from '@/shared/types/result.type'
import type { Session, SessionRevokedReason } from '@/modules/session/entities/session.entity'
import { toSession, type SessionRow } from './session.mapper'

export interface SessionRepository {
  insert(input: {
    userId: string
    absoluteExpiresAt: Date
    ip: string | null
    userAgent: string | null
  }): Promise<Session>
  findById(id: string): Promise<Session | null>
  revoke(id: string, reason: SessionRevokedReason): Promise<void>
  revokeAllByUserId(userId: string, reason: SessionRevokedReason): Promise<void>
  touch(id: string, meta: { ip: string | null; userAgent: string | null }): Promise<void>
  findAllByUserId(userId: string, pagination: PaginationInside): Promise<PaginatedResult<Session>>
  revokeSessionByUserId(sessionId: string, userId: string, reason: SessionRevokedReason): Promise<boolean>
}

export const createSessionRepository = (sql: DatabaseClient): SessionRepository => ({
  insert: async ({ userId, absoluteExpiresAt, ip, userAgent }) => {
    const [row] = await sql<SessionRow[]>`
      INSERT INTO sessions (user_id, absolute_expires_at, ip_address, user_agent, last_seen_at)
      VALUES (${userId}, ${absoluteExpiresAt}, ${ip}, ${userAgent}, NOW())
      RETURNING id, user_id, created_at, absolute_expires_at, last_seen_at, ip_address, user_agent, revoked_at, revoked_reason
    `
    return toSession(row)
  },

  findById: async (id) => {
    const [row] = await sql<SessionRow[]>`
      SELECT id, user_id, created_at, absolute_expires_at, last_seen_at, ip_address, user_agent, revoked_at, revoked_reason
      FROM sessions
      WHERE id = ${id}
    `
    return row ? toSession(row) : null
  },

  revoke: async (id, reason) => {
    await sql`
      UPDATE sessions
      SET revoked_at = NOW(), revoked_reason = ${reason}
      WHERE id = ${id} AND revoked_at IS NULL
    `
  },

  revokeAllByUserId: async (userId, reason) => {
    await sql`
      UPDATE sessions
      SET revoked_at = NOW(), revoked_reason = ${reason}
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `
  },

  touch: async (id, { ip, userAgent }) => {
    await sql`
      UPDATE sessions
      SET last_seen_at = NOW(), ip_address = ${ip}, user_agent = ${userAgent}
      WHERE id = ${id}
    `
  },

  findAllByUserId: async (userId, { limit, offset }) => {
    const [rows, countRows] = await Promise.all([
      sql<SessionRow[]>`
        SELECT
          id,
          user_id,
          created_at,
          absolute_expires_at,
          last_seen_at,
          ip_address,
          user_agent,
          revoked_at,
          revoked_reason
        FROM sessions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,

      sql<{ total: string }[]>`
        SELECT COUNT(*) AS total
        FROM sessions
        WHERE user_id = ${userId}
      `
    ])

    const total = Number(countRows[0]?.total ?? 0)

    return {
      items: rows.map(toSession),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
      }
    }
  },

  revokeSessionByUserId: async (sessionId, userId, reason) => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE sessions
      SET
        revoked_at = NOW(),
        revoked_reason = ${reason}
      WHERE id = ${sessionId}
        AND user_id = ${userId}
        AND revoked_at IS NULL
      RETURNING id
    `

    return row !== undefined
  }
})
