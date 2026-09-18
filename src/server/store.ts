import { randomUUID } from 'node:crypto'
import type {
  Action,
  MatchEvent,
  MatchState,
} from '../engine/index.ts'
import {
  applyAction,
  createMatchState,
  hydrateState,
  replay,
  RuleError,
} from '../engine/index.ts'
import type Database from 'better-sqlite3'

function parseState(raw: string): MatchState {
  return hydrateState(JSON.parse(raw) as MatchState)
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

export class MatchStore {
  constructor(private db: Database.Database) {}

  list(status?: 'live' | 'ended' | 'all'): MatchState[] {
    const rows =
      !status || status === 'all'
        ? this.db.prepare('SELECT snapshot FROM matches ORDER BY updated_at DESC').all()
        : this.db
            .prepare('SELECT snapshot FROM matches WHERE status = ? ORDER BY updated_at DESC')
            .all(status)
    return (rows as Array<{ snapshot: string }>).map((r) => parseState(r.snapshot))
  }

  getByCode(code: string): MatchRecord | null {
    const row = this.db
      .prepare('SELECT id, initial_state, snapshot FROM matches WHERE code = ?')
      .get(code.toUpperCase()) as
      | { id: string; initial_state: string; snapshot: string }
      | undefined
    if (!row) return null
    const events = this.listEvents(row.id)
    return {
      initial: parseState(row.initial_state),
      state: parseState(row.snapshot),
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
      .prepare('SELECT id, initial_state, snapshot FROM matches ORDER BY updated_at DESC')
      .all() as Array<{ id: string; initial_state: string; snapshot: string }>
    return rows.map((row) => ({
      initial: parseState(row.initial_state),
      state: parseState(row.snapshot),
      events: this.listEvents(row.id),
    }))
  }

  create(input: { names: string[]; config?: Parameters<typeof createMatchState>[0]['config'] }): MatchState {
    const id = randomUUID()
    let code = makeCode()
    for (let i = 0; i < 20; i++) {
      const exists = this.db.prepare('SELECT 1 FROM matches WHERE code = ?').get(code)
      if (!exists) break
      code = makeCode()
    }
    const state = createMatchState({ id, code, names: input.names, config: input.config })
    this.db
      .prepare(
        `INSERT INTO matches (id, code, player_count, status, initial_state, snapshot, created_at, updated_at)
         VALUES (@id, @code, @player_count, @status, @initial_state, @snapshot, @created_at, @updated_at)`,
      )
      .run({
        id: state.id,
        code: state.code,
        player_count: state.playerCount,
        status: state.status,
        initial_state: JSON.stringify(state),
        snapshot: JSON.stringify(state),
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      })
    return state
  }

  apply(code: string, action: Action, expectedSeq?: number): MatchRecord {
    const tx = this.db.transaction(() => {
      const current = this.getByCode(code)
      if (!current) throw new RuleError('找不到这场比赛')
      if (expectedSeq !== undefined && expectedSeq !== current.state.seq) {
        throw new ConflictError('比分已被其他设备更新，请核对后再记', current)
      }

      const now = Date.now()
      const eventId = randomUUID()
      let nextState: MatchState
      let event: MatchEvent

      if (action.kind === 'undo') {
        if (current.events.length === 0) throw new RuleError('没有可撤销的记录')
        nextState = replay(current.initial, [
          ...current.events,
          {
            id: eventId,
            seq: current.state.seq + 1,
            at: now,
            action: { kind: 'undo' },
            summary: '撤销上一步',
          },
        ])
        event = {
          id: eventId,
          seq: current.state.seq + 1,
          at: now,
          action: { kind: 'undo' },
          summary: '撤销上一步',
        }
        nextState.seq = event.seq
        nextState.updatedAt = now
      } else {
        const applied = applyAction(current.state, action, now)
        nextState = applied.state
        event = { id: eventId, ...applied.event }
      }

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
}
