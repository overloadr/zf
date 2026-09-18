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
  it('creates, scores, undoes and persists', () => {
    const s = store()
    const created = s.create({ names: ['张三', '李四', '王五'] })
    expect(created.code).toHaveLength(4)
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
})
