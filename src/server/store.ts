import { randomUUID } from 'node:crypto'
import type {
  Action,
  MatchEvent,
  MatchState,
} from '../engine/index.ts'
import {
  commitAction,
  createMatchState,
  hydrateState,
  RuleError,
} from '../engine/index.ts'
import type Database from 'better-sqlite3'
import {
  hashRoomPassword,
  normalizeRoomPassword,
  RoomAuthError,
  verifyRoomPassword,
} from './room-password.ts'

function parseState(raw: string, hasPassword = false): MatchState {
  const state = hydrateState(JSON.parse(raw) as MatchState)
  return { ...state, hasPassword: hasPassword || Boolean(state.hasPassword) }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeCode(len = 4): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!
  }
  return out
}

export interface MatchRecord {
  state: MatchState
  initial: MatchState
  events: MatchEvent[]
}

export class ConflictError extends RuleError {
  constructor(
    message: string,
    public record: MatchRecord,
  ) {
    super(message)
    this.name = 'ConflictError'
  }
}

export type MatchListFilter = {
  status?: 'live' | 'ended' | 'all'
  from?: number
  to?: number
}

export class MatchStore {
  constructor(private db: Database.Database) {}

  list(filter: MatchListFilter | 'live' | 'ended' | 'all' = 'all'): MatchState[] {
    const opts: MatchListFilter = typeof filter === 'string' ? { status: filter } : filter
    const where: string[] = []
    const params: unknown[] = []
    if (opts.status && opts.status !== 'all') {
      where.push('status = ?')
      params.push(opts.status)
    }
    if (opts.from != null && Number.isFinite(opts.from)) {
      where.push('updated_at >= ?')
      params.push(opts.from)
    }
    if (opts.to != null && Number.isFinite(opts.to)) {
      where.push('updated_at <= ?')
      params.push(opts.to)
    }
    const sql = `SELECT snapshot, password_hash FROM matches${
      where.length ? ` WHERE ${where.join(' AND ')}` : ''
    } ORDER BY updated_at DESC`
    const rows = this.db.prepare(sql).all(...params) as Array<{
      snapshot: string
      password_hash: string | null
    }>
    return rows.map((r) => parseState(r.snapshot, Boolean(r.password_hash)))
  }

  getByCode(code: string): MatchRecord | null {
    const row = this.db
      .prepare('SELECT id, initial_state, snapshot, password_hash FROM matches WHERE code = ?')
      .get(code.toUpperCase()) as
      | { id: string; initial_state: string; snapshot: string; password_hash: string | null }
      | undefined
    if (!row) return null
    const locked = Boolean(row.password_hash)
    const events = this.listEvents(row.id)
    return {
      initial: parseState(row.initial_state, locked),
      state: parseState(row.snapshot, locked),
      events,
    }
  }

  listEvents(matchId: string): MatchEvent[] {
    const rows = this.db
      .prepare('SELECT payload FROM events WHERE match_id = ? ORDER BY seq ASC')
      .all(matchId) as Array<{ payload: string }>
    return rows.map((r) => JSON.parse(r.payload) as MatchEvent)
  }

  allRecords(): MatchRecord[] {
    const rows = this.db
      .prepare('SELECT id, initial_state, snapshot, password_hash FROM matches ORDER BY updated_at DESC')
      .all() as Array<{
      id: string
      initial_state: string
      snapshot: string
      password_hash: string | null
    }>
    return rows.map((row) => ({
      initial: parseState(row.initial_state, Boolean(row.password_hash)),
      state: parseState(row.snapshot, Boolean(row.password_hash)),
      events: this.listEvents(row.id),
    }))
  }

  create(input: {
    names: string[]
    config?: Parameters<typeof createMatchState>[0]['config']
    mode?: Parameters<typeof createMatchState>[0]['mode']
    raceTo?: number
    sweepOrder?: Parameters<typeof createMatchState>[0]['sweepOrder']
    concessionDouble?: boolean
    worldGold?: boolean
    localMode?: boolean
    id?: string
    code?: string
    password?: string
  }): MatchState {
    const id = input.localMode && input.id ? input.id : randomUUID()
    let code = input.localMode && input.code ? String(input.code).toUpperCase() : makeCode()
    if (!/^[A-Z0-9]{4,6}$/.test(code)) code = makeCode()
    if (input.localMode && input.id) {
      const sameId = this.db
        .prepare('SELECT snapshot, password_hash FROM matches WHERE id = ?')
        .get(input.id) as { snapshot: string; password_hash: string | null } | undefined
      if (sameId) return parseState(sameId.snapshot, Boolean(sameId.password_hash))
    }
    for (let i = 0; i < 20; i++) {
      const exists = this.db.prepare('SELECT 1 FROM matches WHERE code = ?').get(code)
      if (!exists) break
      if (input.localMode && input.id) {
        const row = this.getByCode(code)
        if (row?.state.id === input.id) return row.state
      }
      code = makeCode()
    }
    const password = normalizeRoomPassword(input.password)
    const state = createMatchState({
      id,
      code,
      names: input.names,
      config: input.config,
      mode: input.mode,
      raceTo: input.raceTo,
      sweepOrder: input.sweepOrder,
      concessionDouble: input.concessionDouble,
      worldGold: input.worldGold,
      localMode: Boolean(input.localMode),
      hasPassword: Boolean(password),
    })
    this.db
      .prepare(
        `INSERT INTO matches (id, code, player_count, status, initial_state, snapshot, password_hash, created_at, updated_at)
         VALUES (@id, @code, @player_count, @status, @initial_state, @snapshot, @password_hash, @created_at, @updated_at)`,
      )
      .run({
        id: state.id,
        code: state.code,
        player_count: state.playerCount,
        status: state.status,
        initial_state: JSON.stringify(state),
        snapshot: JSON.stringify(state),
        password_hash: password ? hashRoomPassword(password) : null,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      })
    return state
  }

  getPasswordHash(code: string): string | null {
    const row = this.db
      .prepare('SELECT password_hash FROM matches WHERE code = ?')
      .get(code.toUpperCase()) as { password_hash: string | null } | undefined
    return row?.password_hash ?? null
  }

  assertAccess(code: string, password?: string): void {
    const hash = this.getPasswordHash(code)
    if (!hash) return
    const given = (password ?? '').trim()
    if (!given) throw new RoomAuthError('请输入房间密码')
    if (!verifyRoomPassword(given, hash)) throw new RoomAuthError('房间密码不对')
  }

  apply(code: string, action: Action, expectedSeq?: number): MatchRecord {
    const tx = this.db.transaction(() => {
      const current = this.getByCode(code)
      if (!current) throw new RuleError('找不到这场比赛')
      if (current.state.localMode) {
        throw new RuleError('本场为本地记分，请在原手机继续，有网后会自动上传')
      }
      if (expectedSeq !== undefined && expectedSeq !== current.state.seq) {
        throw new ConflictError('比分已被其他设备更新，请核对后再记', current)
      }

      const now = Date.now()
      const { state: nextState, event } = commitAction(
        current.initial,
        current.state,
        current.events,
        action,
        now,
        randomUUID(),
      )

      this.db
        .prepare(
          `INSERT INTO events (id, match_id, seq, payload, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(event.id, current.state.id, event.seq, JSON.stringify(event), event.at)
      this.db
        .prepare(
          `UPDATE matches SET snapshot = ?, status = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(nextState), nextState.status, nextState.updatedAt, current.state.id)

      return {
        initial: current.initial,
        state: nextState,
        events: [...current.events, event],
      } satisfies MatchRecord
    })
    return tx()
  }

  syncLocal(code: string, incoming: MatchEvent[]): MatchRecord {
    const tx = this.db.transaction(() => {
      let current = this.getByCode(code)
      if (!current) throw new RuleError('找不到这场比赛')
      if (!current.state.localMode) throw new RuleError('联网局请用实时记分，不能整包同步')
      const sorted = [...incoming].sort((a, b) => a.seq - b.seq)
      for (const incomingEvent of sorted) {
        if (!incomingEvent || !incomingEvent.action) continue
        if (incomingEvent.seq <= current.state.seq) {
          const existing = current.events.find((e) => e.seq === incomingEvent.seq)
          if (existing && existing.id === incomingEvent.id) continue
          throw new ConflictError('服务器记录与本机不一致，请核对本场', current)
        }
        if (incomingEvent.seq !== current.state.seq + 1) {
          throw new ConflictError('同步事件不连续，请核对本场', current)
        }
        const { state: nextState, event } = commitAction(
          current.initial,
          current.state,
          current.events,
          incomingEvent.action,
          incomingEvent.at || Date.now(),
          incomingEvent.id || randomUUID(),
        )
        this.db
          .prepare(
            `INSERT INTO events (id, match_id, seq, payload, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(event.id, current.state.id, event.seq, JSON.stringify(event), event.at)
        this.db
          .prepare(
            `UPDATE matches SET snapshot = ?, status = ?, updated_at = ? WHERE id = ?`,
          )
          .run(JSON.stringify(nextState), nextState.status, nextState.updatedAt, current.state.id)
        current = {
          initial: current.initial,
          state: nextState,
          events: [...current.events, event],
        }
      }
      return current
    })
    return tx()
  }

  deleteEnded(code: string): MatchState {
    const current = this.getByCode(code)
    if (!current) throw new RuleError('找不到这场比赛')
    if (current.state.status !== 'ended') throw new RuleError('只能删除已结束的比赛')
    const run = this.db.transaction(() => {
      this.db.prepare('DELETE FROM events WHERE match_id = ?').run(current.state.id)
      this.db.prepare('DELETE FROM matches WHERE id = ?').run(current.state.id)
    })
    run()
    return current.state
  }
}
