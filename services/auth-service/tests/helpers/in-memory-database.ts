import type { DatabaseClient } from '@/shared/database/client'
import type { SessionRevokedReason } from '@/modules/session/entities/session.entity'
import type { RefreshTokenRow } from '@/modules/session/repo/refresh-token.mapper'
import type { SessionRow } from '@/modules/session/repo/session.mapper'
import type { AuthAccountRow } from '@/modules/auth/repo/auth.mapper'
import type { OutgoingIntegrationEvent } from '@/modules/integration-events/outgoing/repo/outbox.repository'

export interface InMemoryOutboxEvent {
  id: string
  event_type: string
  aggregate_id: string
  payload: OutgoingIntegrationEvent
  occurred_at: Date
  attempt_count: number
  next_attempt_at: Date
  locked_until: Date | null
  lease_owner: string | null
  published_at: Date | null
  dead_lettered_at: Date | null
  last_error: string | null
}

const normalizeQuery = (parts: TemplateStringsArray) =>
  parts.join('?').replace(/\s+/g, ' ').trim().toLowerCase()

const clone = <T>(value: T): T => structuredClone(value)

export interface InMemoryDatabase {
  sql: DatabaseClient
  authAccounts: AuthAccountRow[]
  sessions: SessionRow[]
  refreshTokens: RefreshTokenRow[]
  outboxEvents: InMemoryOutboxEvent[]
}

export const createInMemoryDatabase = (): InMemoryDatabase => {
  const authAccounts: AuthAccountRow[] = []
  const sessions: SessionRow[] = []
  const refreshTokens: RefreshTokenRow[] = []
  const outboxEvents: InMemoryOutboxEvent[] = []
  let sequence = 1

  const id = () => `00000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, '0')}`

  const query = (parts: TemplateStringsArray, ...values: unknown[]): Promise<unknown> => {
    const text = normalizeQuery(parts)
    const now = new Date()

    if (text === 'select 1') return Promise.resolve([{ '?column?': 1 }])

    if (text.startsWith('insert into auth_accounts')) {
      const row: AuthAccountRow = {
        id: id(),
        email: values[0] as string,
        password_hash: values[1] as string,
        auth_status: 'active',
        created_at: now,
        updated_at: now,
      }
      authAccounts.push(row)
      return Promise.resolve([clone(row)])
    }

    if (text.startsWith('insert into outbox_events')) {
      const row: InMemoryOutboxEvent = {
        id: values[0] as string,
        event_type: values[1] as string,
        aggregate_id: values[2] as string,
        payload: JSON.parse(values[3] as string) as OutgoingIntegrationEvent,
        occurred_at: values[4] as Date,
        attempt_count: 0,
        next_attempt_at: now,
        locked_until: null,
        lease_owner: null,
        published_at: null,
        dead_lettered_at: null,
        last_error: null,
      }
      outboxEvents.push(row)
      return Promise.resolve([])
    }

    if (text.startsWith('with candidates as') && text.includes('update outbox_events')) {
      const [batchSize, leaseMs, leaseOwner] = values as [number, number, string]
      const claimed = outboxEvents
        .filter(event => event.published_at === null && event.dead_lettered_at === null)
        .filter(event => event.next_attempt_at <= now)
        .filter(event => event.locked_until === null || event.locked_until <= now)
        .sort((a, b) => a.next_attempt_at.getTime() - b.next_attempt_at.getTime())
        .slice(0, batchSize)
      for (const event of claimed) {
        event.attempt_count += 1
        event.locked_until = new Date(now.getTime() + leaseMs)
        event.lease_owner = leaseOwner
      }
      return Promise.resolve(clone(claimed))
    }

    if (text.startsWith('update outbox_events') && text.includes('set published_at = now()')) {
      const [eventId, leaseOwner] = values as [string, string]
      const event = outboxEvents.find(row => row.id === eventId)
      if (event && event.lease_owner === leaseOwner && event.locked_until! > now
        && !event.dead_lettered_at) {
        event.published_at = now
        event.locked_until = null
        event.lease_owner = null
        event.last_error = null
        return Promise.resolve([{ id: event.id }])
      }
      return Promise.resolve([])
    }

    if (text.startsWith('update outbox_events') && text.includes('set next_attempt_at = ?')) {
      const [nextAttemptAt, lastError, eventId, leaseOwner] = values as [Date, string, string, string]
      const event = outboxEvents.find(row => row.id === eventId)
      if (event && event.lease_owner === leaseOwner && event.locked_until! > now
        && !event.published_at && !event.dead_lettered_at) {
        event.next_attempt_at = nextAttemptAt
        event.locked_until = null
        event.lease_owner = null
        event.last_error = lastError
        return Promise.resolve([{ id: event.id }])
      }
      return Promise.resolve([])
    }

    if (text.startsWith('update outbox_events') && text.includes('set dead_lettered_at = now()')) {
      const [lastError, eventId, leaseOwner] = values as [string, string, string]
      const event = outboxEvents.find(row => row.id === eventId)
      if (event && event.lease_owner === leaseOwner && event.locked_until! > now
        && !event.published_at && !event.dead_lettered_at) {
        event.dead_lettered_at = now
        event.locked_until = null
        event.lease_owner = null
        event.last_error = lastError
        return Promise.resolve([{ id: event.id }])
      }
      return Promise.resolve([])
    }

    if (text.includes('as oldest_pending_age_seconds') && text.includes('from outbox_events')) {
      const pending = outboxEvents.filter(row => !row.published_at && !row.dead_lettered_at)
      const oldest = pending.reduce<Date | null>(
        (value, row) => value === null || row.occurred_at < value ? row.occurred_at : value,
        null,
      )
      return Promise.resolve([{
        pending: String(pending.length),
        dead_lettered: String(outboxEvents.filter(row => row.dead_lettered_at).length),
        oldest_pending_age_seconds: oldest
          ? Math.max(0, (now.getTime() - oldest.getTime()) / 1000)
          : 0,
      }])
    }

    if (text.includes('from auth_accounts') && text.includes('where email = ?')) {
      const row = authAccounts.find(account => account.email === values[0])
      return Promise.resolve(row ? [clone(row)] : [])
    }

    if (text.includes('from auth_accounts') && text.includes('where id = ?')) {
      const row = authAccounts.find(account => account.id === values[0])
      return Promise.resolve(row ? [clone(row)] : [])
    }

    if (text.startsWith('update auth_accounts')) {
      const [newHash, userId, oldHash] = values as [string, string, string]
      const row = authAccounts.find(
        account => account.id === userId && account.password_hash === oldHash,
      )
      if (!row) return Promise.resolve([])
      row.password_hash = newHash
      row.updated_at = now
      return Promise.resolve([{ id: row.id }])
    }

    if (text.startsWith('insert into sessions')) {
      const row: SessionRow = {
        id: id(),
        user_id: values[0] as string,
        absolute_expires_at: values[1] as Date,
        ip_address: values[2] as string | null,
        user_agent: values[3] as string | null,
        created_at: now,
        last_seen_at: now,
        revoked_at: null,
        revoked_reason: null,
      }
      sessions.push(row)
      return Promise.resolve([clone(row)])
    }

    if (text.includes('from sessions') && text.includes('where id = ?')) {
      const row = sessions.find(session => session.id === values[0])
      return Promise.resolve(row ? [clone(row)] : [])
    }

    if (text.startsWith('select count(*) as total from sessions')) {
      return Promise.resolve([
        { total: String(sessions.filter(session => session.user_id === values[0]).length) },
      ])
    }

    if (text.includes('from sessions') && text.includes('order by created_at desc')) {
      const [userId, limit, offset] = values as [string, number, number]
      const rows = sessions
        .filter(session => session.user_id === userId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(offset, offset + limit)
      return Promise.resolve(clone(rows))
    }

    if (text.startsWith('update sessions') && text.includes('where id = ? and user_id = ?')) {
      const [reason, sessionId, userId] = values as [SessionRevokedReason, string, string]
      const row = sessions.find(session =>
        session.id === sessionId && session.user_id === userId && session.revoked_at === null,
      )
      if (!row) return Promise.resolve([])
      row.revoked_at = now
      row.revoked_reason = reason
      return Promise.resolve([{ id: row.id }])
    }

    if (text.startsWith('update sessions') && text.includes('where user_id = ?')) {
      const [reason, userId] = values as [SessionRevokedReason, string]
      for (const row of sessions) {
        if (row.user_id === userId && row.revoked_at === null) {
          row.revoked_at = now
          row.revoked_reason = reason
        }
      }
      return Promise.resolve([])
    }

    if (text.startsWith('update sessions') && text.includes('set last_seen_at = now()')) {
      const [ip, userAgent, sessionId] = values as [string | null, string | null, string]
      const row = sessions.find(session => session.id === sessionId)
      if (row) {
        row.last_seen_at = now
        row.ip_address = ip
        row.user_agent = userAgent
      }
      return Promise.resolve([])
    }

    if (text.startsWith('update sessions')) {
      const [reason, sessionId] = values as [SessionRevokedReason, string]
      const row = sessions.find(session => session.id === sessionId && session.revoked_at === null)
      if (row) {
        row.revoked_at = now
        row.revoked_reason = reason
      }
      return Promise.resolve([])
    }

    if (text.startsWith('insert into refresh_tokens')) {
      const row: RefreshTokenRow = {
        id: id(),
        session_id: values[0] as string,
        user_id: values[1] as string,
        token_hash: values[2] as string,
        expires_at: values[3] as Date,
        ip_address: values[4] as string | null,
        user_agent: values[5] as string | null,
        created_at: now,
        updated_at: now,
        revoked_at: null,
        last_used_at: null,
        replaced_by: null,
      }
      refreshTokens.push(row)
      return Promise.resolve([clone(row)])
    }

    if (text.includes('from refresh_tokens') && text.includes('where token_hash = ?')) {
      const row = refreshTokens.find(token => token.token_hash === values[0])
      return Promise.resolve(row ? [clone(row)] : [])
    }

    if (text.startsWith('update refresh_tokens')) {
      const [replacementId, tokenId] = values as [string | null, string]
      const row = refreshTokens.find(token => token.id === tokenId && token.revoked_at === null)
      if (!row) return Promise.resolve([])
      row.revoked_at = now
      row.last_used_at = now
      row.replaced_by = replacementId
      return Promise.resolve([{ id: row.id }])
    }

    throw new Error(`Unsupported in-memory SQL query: ${text}`)
  }

  const sql = query as unknown as DatabaseClient
  sql.begin = (async (callback: (transaction: DatabaseClient) => unknown) => callback(sql)) as typeof sql.begin

  return { sql, authAccounts, sessions, refreshTokens, outboxEvents }
}
