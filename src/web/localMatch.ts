import {
  commitAction,
  createMatchState,
  type Action,
  type MatchEvent,
  type MatchState,
} from '@engine'
import { createMatch, syncMatch } from './api.ts'
import { setRoomPassword } from './roomAccess.ts'

const PREFIX = 'zf:local:'
const INDEX_KEY = 'zf:local:index'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface LocalRecord {
  initial: MatchState
  state: MatchState
  events: MatchEvent[]
  syncedSeq: number
  registered: boolean
  password?: string
}

const inflight = new Map<string, Promise<void>>()

export function makeMatchCode(len = 4): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!
  }
  return out
}

export function newMatchId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function key(code: string) {
  return PREFIX + code.toUpperCase()
}

function readIndex(): string[] {
  const raw = storage()?.getItem(INDEX_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.map((c) => String(c).toUpperCase()) : []
  } catch {
    return []
  }
}

function writeIndex(codes: string[]) {
  storage()?.setItem(INDEX_KEY, JSON.stringify([...new Set(codes)]))
}

export function loadLocal(code: string): LocalRecord | null {
  const raw = storage()?.getItem(key(code))
  if (!raw) return null
  try {
    const rec = JSON.parse(raw) as LocalRecord
    if (!rec?.state || !rec.initial) return null
    return rec
  } catch {
    return null
  }
}

export function saveLocal(record: LocalRecord): void {
  const code = record.state.code.toUpperCase()
  record.state.code = code
  record.initial.code = code
  storage()?.setItem(key(code), JSON.stringify(record))
  writeIndex([...readIndex(), code])
}

export function removeLocal(code: string): void {
  const upper = code.toUpperCase()
  storage()?.removeItem(key(upper))
  writeIndex(readIndex().filter((c) => c !== upper))
}

export function listLocal(): LocalRecord[] {
  const seen = new Set<string>()
  const out: LocalRecord[] = []
  for (const code of readIndex()) {
    const rec = loadLocal(code)
    if (!rec || seen.has(rec.state.id)) continue
    seen.add(rec.state.id)
    out.push(rec)
  }
  return out
}

export function startLocalMatch(opts: Parameters<typeof createMatchState>[0] & { password?: string }): LocalRecord {
  const state = createMatchState({ ...opts, localMode: true })
  const record: LocalRecord = {
    initial: structuredClone(state),
    state,
    events: [],
    syncedSeq: 0,
    registered: false,
    password: opts.password,
  }
  saveLocal(record)
  if (opts.password) setRoomPassword(state.code, opts.password)
  return record
}

function createBody(record: LocalRecord) {
  const initial = record.initial
  return {
    names: [...initial.players].sort((a, b) => a.seat - b.seat).map((p) => p.name),
    points: initial.mode === 'eight' ? undefined : { ...initial.config.points },
    mode: initial.mode,
    raceTo: initial.raceTo,
    sweepOrder: initial.sweepOrder,
    concessionDouble: initial.concessionDouble,
    worldGold: initial.worldGold,
    localMode: true as const,
    id: initial.id,
    code: initial.code,
    password: record.password,
  }
}

async function flushOnce(code: string): Promise<void> {
  const record = loadLocal(code)
  if (!record) return
  if (!record.registered) {
    const originalCode = record.state.code
    const { state } = await createMatch(createBody(record))
    if (state.code !== originalCode) {
      record.initial.code = state.code
      record.state.code = state.code
      if (record.password) setRoomPassword(state.code, record.password)
      saveLocal(record)
      storage()?.setItem(key(originalCode), JSON.stringify(record))
      writeIndex([...readIndex(), originalCode, state.code])
    }
    record.registered = true
    saveLocal(record)
  }
  if (record.syncedSeq >= record.state.seq) return
  const events = record.events.filter((e) => e.seq > record.syncedSeq)
  if (events.length === 0) {
    record.syncedSeq = record.state.seq
    saveLocal(record)
    return
  }
  const synced = await syncMatch(record.state.code, events)
  record.syncedSeq = synced.state.seq
  saveLocal(record)
}

export function flushLocalMatch(code: string): Promise<void> {
  const upper = code.toUpperCase()
  const pending = inflight.get(upper) ?? Promise.resolve()
  const next = pending.then(() => flushOnce(upper)).catch(() => undefined)
  inflight.set(upper, next)
  return next
}

export function mergeMatchLists(server: MatchState[], status: 'live' | 'ended'): MatchState[] {
  const byCode = new Map<string, MatchState>()
  for (const match of server) byCode.set(match.code, match)
  for (const rec of listLocal()) {
    if (rec.state.status !== status) continue
    const current = byCode.get(rec.state.code)
    if (!current || rec.state.seq >= current.seq) byCode.set(rec.state.code, rec.state)
  }
  return [...byCode.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function pendingSync(record: LocalRecord | null): boolean {
  return Boolean(record && (record.syncedSeq < record.state.seq || !record.registered))
}

export function commitLocal(code: string, action: Action): LocalRecord {
  const rec = loadLocal(code)
  if (!rec) throw new Error('找不到本机比赛')
  const { state, event } = commitAction(rec.initial, rec.state, rec.events, action)
  rec.state = state
  rec.events = [...rec.events, event]
  saveLocal(rec)
  return rec
}
