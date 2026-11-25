import { describe, expect, it } from 'vitest'
import { commitAction, createMatchState } from '@engine'
import { mergeServerIntoLocal, type LocalRecord } from './localMatch.ts'

function localMatch() {
  const state = createMatchState({
    id: 'm1',
    code: 'ABCD',
    names: ['甲', '乙'],
    localMode: true,
    now: 1,
  })
  return {
    initial: state,
    state,
    events: [] as LocalRecord['events'],
    syncedSeq: 0,
    registered: true,
  } satisfies LocalRecord
}

function scored(rec: LocalRecord, id: string, at: number) {
  const { state, event } = commitAction(
    rec.initial,
    rec.state,
    rec.events,
    { kind: 'win', winType: 'normal', playerId: rec.state.players[0]!.id },
    at,
    id,
  )
  return {
    ...rec,
    state,
    events: [...rec.events, event],
  }
}

describe('mergeServerIntoLocal', () => {
  it('takes the server snapshot when another phone is ahead', () => {
    const local = localMatch()
    const other = scored(localMatch(), 'e-other', 2)
    const { record, replaced } = mergeServerIntoLocal(local, {
      initial: other.initial,
      state: other.state,
      events: other.events,
    })
    expect(replaced).toBe(true)
    expect(record.state.seq).toBe(1)
    expect(record.syncedSeq).toBe(1)
    expect(record.events[0]?.id).toBe('e-other')
  })

  it('keeps pending local events when they continue the server prefix', () => {
    const first = scored(localMatch(), 'e1', 2)
    const local = scored({ ...first, syncedSeq: 1 }, 'e2', 3)
    const { record, replaced } = mergeServerIntoLocal(local, {
      initial: first.initial,
      state: first.state,
      events: first.events,
    })
    expect(replaced).toBe(false)
    expect(record.state.seq).toBe(2)
    expect(record.syncedSeq).toBe(1)
    expect(record.events.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('replaces a forked local history with the server copy', () => {
    const local = scored(localMatch(), 'e-local', 2)
    const other = scored(localMatch(), 'e-other', 2)
    const { record, replaced } = mergeServerIntoLocal(local, {
      initial: other.initial,
      state: other.state,
      events: other.events,
    })
    expect(replaced).toBe(true)
    expect(record.events[0]?.id).toBe('e-other')
  })
})
