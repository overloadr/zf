import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getRoles } from '../engine/index.ts'
import { openDatabase } from './db.ts'
import { MatchStore } from './store.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

function store() {
  const root = path.join(process.cwd(), 'data')
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.mkdtempSync(path.join(root, 'test-'))
  dirs.push(dir)
  return new MatchStore(openDatabase(path.join(dir, 't.db')))
}

describe('MatchStore', () => {
  it('creates a 中8 race and ends at raceTo', () => {
    const s = store()
    const created = s.create({ names: ['甲', '乙'], mode: 'eight', raceTo: 1 })
    expect(created.mode).toBe('eight')
    expect(created.raceTo).toBe(1)
    const after = s.apply(created.code, { kind: 'win', winType: 'breakClear' }, 0)
    expect(after.state.players[0]?.score).toBe(1)
    expect(after.state.status).toBe('ended')
  })

  it('creates, scores, undoes and persists', () => {
    const s = store()
    const created = s.create({ names: ['张三', '李四', '王五'] })
    expect(created.code).toHaveLength(4)
    expect(created.mode).toBe('chase')
    const afterWin = s.apply(created.code, { kind: 'win', winType: 'smallGold' }, 0)
    expect(getRoles(afterWin.state).ben.name).toBe('张三')
    expect(afterWin.state.players.find((p) => p.name === '张三')?.score).toBe(7)
    const undone = s.apply(created.code, { kind: 'undo' }, 1)
    expect(undone.state.players.every((p) => p.score === 0)).toBe(true)
    expect(undone.state.currentIndex).toBe(0)
    const loaded = s.getByCode(created.code)
    expect(loaded?.state.seq).toBe(2)
  })

  it('rejects stale expectedSeq', () => {
    const s = store()
    const created = s.create({ names: ['甲', '乙'] })
    s.apply(created.code, { kind: 'foul', foulType: 'normal' }, 0)
    expect(() => s.apply(created.code, { kind: 'win', winType: 'normal' }, 0)).toThrow(
      /其他设备/,
    )
  })

  it('lists ended matches by updated_at range and deletes them', () => {
    const s = store()
    const live = s.create({ names: ['甲', '乙'] })
    const ended = s.create({ names: ['丙', '丁'] })
    s.apply(ended.code, { kind: 'endMatch' }, 0)
    const now = Date.now()
    expect(s.list({ status: 'ended' })).toHaveLength(1)
    expect(s.list({ status: 'ended', from: now + 60_000 })).toHaveLength(0)
    expect(s.list({ status: 'ended', to: now })).toHaveLength(1)
    expect(() => s.deleteEnded(live.code)).toThrow(/已结束/)
    s.deleteEnded(ended.code)
    expect(s.getByCode(ended.code)).toBeNull()
    expect(s.list('ended')).toHaveLength(0)
  })

  it('gates a passworded room and keeps concessionDouble', () => {
    const s = store()
    const created = s.create({
      names: ['甲', '乙'],
      concessionDouble: false,
      password: 'secret',
    })
    expect(created.concessionDouble).toBe(false)
    expect(created.hasPassword).toBe(true)
    expect(() => s.assertAccess(created.code, '')).toThrow(/房间密码/)
    expect(() => s.assertAccess(created.code, 'nope')).toThrow(/不对/)
    s.assertAccess(created.code, 'secret')
    const listed = s.list('live')[0]
    expect(listed?.hasPassword).toBe(true)
    expect(listed?.concessionDouble).toBe(false)
  })
})
