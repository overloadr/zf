import { describe, expect, it } from 'vitest'
import {
  applyAction,
  collapseUndos,
  computeMatchStats,
  createMatchState,
  getRoles,
  hydrateState,
  orderAfterSweep,
  previewFoul,
  previewWin,
  replay,
  RuleError,
} from './index.ts'
import type { MatchEvent } from './types.ts'

function three() {
  return createMatchState({
    id: 'm1',
    code: 'ABCD',
    names: ['张三', '李四', '王五'],
    now: 1,
  })
}

function two() {
  return createMatchState({
    id: 'm2',
    code: 'EFGH',
    names: ['甲', '乙'],
    now: 1,
  })
}

function eventFrom(applied: ReturnType<typeof applyAction>): MatchEvent {
  return {
    id: `e${applied.state.seq}`,
    ...applied.event,
  }
}

describe('createMatchState', () => {
  it('creates 3-player live match with 1-4-7-10 points', () => {
    const s = three()
    expect(s.mode).toBe('chase')
    expect(s.sweepOrder).toBe('keep')
    expect(s.concessionDouble).toBe(true)
    expect(s.hasPassword).toBe(false)
    expect(s.config.points).toEqual({
      foul: 1,
      normal: 4,
      smallGold: 7,
      bigGold: 10,
      goldenNine: 4,
    })
    const roles = getRoles(s)
    expect(roles.ben.name).toBe('张三')
    expect(roles.shang.name).toBe('王五')
    expect(roles.xia.name).toBe('李四')
  })

  it('hydrates legacy snapshots without mode as chase', () => {
    const s = three()
    const legacy = { ...s, mode: undefined, raceTo: undefined } as unknown as typeof s
    const live = hydrateState(legacy)
    expect(live.mode).toBe('chase')
    expect(live.raceTo).toBeUndefined()
  })

  it('rejects invalid player counts', () => {
    expect(() =>
      createMatchState({ id: 'x', code: 'X', names: ['A'] }),
    ).toThrow(RuleError)
  })
})

describe('3-player chase', () => {
  it('普胜 4 分 from 上家，赢家继续开球，输家变二杆', () => {
    const s0 = three()
    const preview = previewWin(s0, 'normal')
    expect(preview.loserName).toBe('王五')
    expect(preview.amount).toBe(4)
    const { state } = applyAction(s0, { kind: 'win', winType: 'normal' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(4)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(-4)
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2])
    const roles = getRoles(state)
    expect(roles.ben.name).toBe('张三')
    expect(state.shotOrder.map((id) => state.players.find((p) => p.id === id)!.name)).toEqual([
      '张三',
      '王五',
      '李四',
    ])
  })

  it('小金 7 分 from 上家; 大金/黄金九由其余两家各赔', () => {
    const s0 = three()
    expect(previewWin(s0, 'smallGold').amount).toBe(7)
    const big = previewWin(s0, 'bigGold')
    expect(big.amount).toBe(20)
    expect(big.payers.map((p) => p.loserName).sort()).toEqual(['李四', '王五'])
    const nine = previewWin(s0, 'goldenNine')
    expect(nine.amount).toBe(8)
    const { state } = applyAction(s0, { kind: 'win', winType: 'bigGold' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(20)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(-10)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(-10)
  })

  function namesOf(state: ReturnType<typeof createMatchState>) {
    return state.shotOrder.map((id) => state.players.find((p) => p.id === id)!.name)
  }

  it('通吃后默认二杆三杆保持不变', () => {
    const s0 = three()
    const { state } = applyAction(s0, { kind: 'win', winType: 'bigGold' }, 2)
    expect(namesOf(state)).toEqual(['张三', '李四', '王五'])
    const nine = applyAction(state, { kind: 'win', winType: 'goldenNine' }, 3)
    expect(namesOf(nine.state)).toEqual(['张三', '李四', '王五'])
  })

  it('通吃后二杆三杆可轮换', () => {
    const s0 = createMatchState({
      id: 'm1',
      code: 'ABCD',
      names: ['张三', '李四', '王五'],
      sweepOrder: 'rotate',
      now: 1,
    })
    const w1 = applyAction(s0, { kind: 'win', winType: 'goldenNine' }, 2)
    expect(namesOf(w1.state)).toEqual(['张三', '王五', '李四'])
    const w2 = applyAction(w1.state, { kind: 'win', winType: 'bigGold' }, 3)
    expect(namesOf(w2.state)).toEqual(['张三', '李四', '王五'])
  })

  it('通吃后二杆三杆可随机', () => {
    const s0 = createMatchState({
      id: 'm1',
      code: 'ABCD',
      names: ['张三', '李四', '王五'],
      sweepOrder: 'random',
      now: 1,
    })
    const winner = s0.players[0]!.id
    const seen = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      seen.add(orderAfterSweep(s0, winner, 'random', seed).slice(1).join(','))
    }
    expect(seen.size).toBe(2)
  })

  it('让杆普胜直接由下家双倍赔 8 分', () => {
    const s0 = three()
    const preview = previewWin(s0, 'concession')
    expect(preview.winType).toBe('concession')
    expect(preview.loserName).toBe('李四')
    expect(preview.amount).toBe(8)
    const { state } = applyAction(s0, { kind: 'win', winType: 'concession' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(8)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(-8)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(0)
  })

  it('让杆小金直接由下家双倍赔 14 分', () => {
    const s0 = three()
    const preview = previewWin(s0, 'concessionSmallGold')
    expect(preview.winType).toBe('concessionSmallGold')
    expect(preview.amount).toBe(14)
    expect(preview.payers).toHaveLength(1)
    expect(preview.loserName).toBe('李四')
    const { state } = applyAction(s0, { kind: 'win', winType: 'concessionSmallGold' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(14)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(-14)
  })

  it('先让杆再普胜仍由下家双倍赔 8 分', () => {
    const s0 = three()
    const conceded = applyAction(s0, { kind: 'startConcession' }, 2).state
    const preview = previewWin(conceded, 'normal')
    expect(preview.winType).toBe('concession')
    expect(preview.loserName).toBe('李四')
    expect(preview.amount).toBe(8)
    const { state } = applyAction(conceded, { kind: 'win', winType: 'normal' }, 3)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(8)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(-8)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(0)
    expect(state.concessionActive).toBe(false)
  })

  it('让杆后小金由下家双倍赔 14', () => {
    const s0 = three()
    const conceded = applyAction(s0, { kind: 'startConcession' }, 2).state
    const preview = previewWin(conceded, 'smallGold')
    expect(preview.amount).toBe(14)
    expect(preview.payers).toHaveLength(1)
    expect(preview.loserName).toBe('李四')
  })

  it('关闭让杆翻倍时由下家按一倍赔', () => {
    const s0 = createMatchState({
      id: 'm1',
      code: 'ABCD',
      names: ['张三', '李四', '王五'],
      concessionDouble: false,
      now: 1,
    })
    expect(s0.concessionDouble).toBe(false)
    const preview = previewWin(s0, 'concession')
    expect(preview.winType).toBe('concession')
    expect(preview.concession).toBe(true)
    expect(preview.doubled).toBe(false)
    expect(preview.loserName).toBe('李四')
    expect(preview.amount).toBe(4)
    const { state } = applyAction(s0, { kind: 'win', winType: 'concession' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(4)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(-4)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(0)
    expect(state.shotOrder.map((id) => state.players.find((p) => p.id === id)!.name)).toEqual([
      '张三',
      '李四',
      '王五',
    ])
    const gold = previewWin(s0, 'concessionSmallGold')
    expect(gold.amount).toBe(7)
    const afterStart = applyAction(s0, { kind: 'startConcession' }, 2).state
    expect(previewWin(afterStart, 'normal').amount).toBe(4)
  })

  it('普通犯规赔上家 1 分并轮转', () => {
    const s0 = three()
    const foul = previewFoul(s0)
    expect(foul.amount).toBe(1)
    expect(foul.receiverName).toBe('王五')
    const { state, event } = applyAction(s0, { kind: 'foul', foulType: 'normal' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(-1)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(1)
    expect(getRoles(state).ben.name).toBe('李四')
    expect(event.summary).toContain('普通犯规')
  })

  it('让杆犯规直接赔下家 1 分', () => {
    const s0 = three()
    const preview = previewFoul(s0, undefined, 'concession')
    expect(preview.foulType).toBe('concession')
    expect(preview.receiverName).toBe('李四')
    expect(preview.amount).toBe(1)
    const { state, event } = applyAction(s0, { kind: 'foul', foulType: 'concession' }, 2)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(-1)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(1)
    expect(state.players.find((p) => p.name === '王五')?.score).toBe(0)
    expect(getRoles(state).ben.name).toBe('李四')
    expect(event.summary).toContain('让杆犯规')
  })

  it('先让杆再犯规仍赔下家 1 分并取消让杆', () => {
    const s0 = three()
    const conceded = applyAction(s0, { kind: 'startConcession' }, 2).state
    const { state, event } = applyAction(conceded, { kind: 'foul', foulType: 'concession' }, 3)
    expect(state.concessionActive).toBe(false)
    expect(state.players.find((p) => p.name === '张三')?.score).toBe(-1)
    expect(state.players.find((p) => p.name === '李四')?.score).toBe(1)
    expect(event.summary).toContain('让杆犯规')
  })
})

describe('2-player chase', () => {
  it('小金只向对手收 7 分', () => {
    const s0 = two()
    const { state } = applyAction(s0, { kind: 'win', winType: 'smallGold' }, 2)
    expect(state.players.find((p) => p.name === '甲')?.score).toBe(7)
    expect(state.players.find((p) => p.name === '乙')?.score).toBe(-7)
    expect(getRoles(state).ben.name).toBe('甲')
  })

  it('两人大金只收对手 10 分一次', () => {
    const s0 = two()
    const preview = previewWin(s0, 'bigGold')
    expect(preview.amount).toBe(10)
    expect(preview.payers).toHaveLength(1)
  })

  it('让杆胜为普胜双倍 8 分', () => {
    const s0 = two()
    const conceded = applyAction(s0, { kind: 'startConcession' }, 2).state
    const { state } = applyAction(conceded, { kind: 'win', winType: 'concession' }, 3)
    expect(state.players.find((p) => p.name === '甲')?.score).toBe(8)
    expect(state.players.find((p) => p.name === '乙')?.score).toBe(-8)
  })

  it('让杆犯规赔对手 1 分', () => {
    const s0 = two()
    const { state, event } = applyAction(s0, { kind: 'foul', foulType: 'concession' }, 2)
    expect(state.players.find((p) => p.name === '甲')?.score).toBe(-1)
    expect(state.players.find((p) => p.name === '乙')?.score).toBe(1)
    expect(event.summary).toContain('让杆犯规')
  })
})

describe('replay and undo', () => {
  it('replays a sequence of events', () => {
    const initial = three()
    const a1 = applyAction(initial, { kind: 'win', winType: 'normal' }, 2)
    const a2 = applyAction(a1.state, { kind: 'foul', foulType: 'normal' }, 3)
    const events = [eventFrom(a1), eventFrom(a2)]
    const replayed = replay(initial, events)
    expect(replayed.players.map((p) => p.score)).toEqual(a2.state.players.map((p) => p.score))
    expect(replayed.currentIndex).toBe(a2.state.currentIndex)
  })

  it('undo pops the last effective action', () => {
    const initial = three()
    const a1 = applyAction(initial, { kind: 'win', winType: 'bigGold' }, 2)
    const events: MatchEvent[] = [
      eventFrom(a1),
      {
        id: 'u1',
        seq: 2,
        at: 3,
        action: { kind: 'undo' },
        summary: '撤销',
      },
    ]
    expect(collapseUndos(events)).toEqual([])
    const replayed = replay(initial, events)
    expect(replayed.players.every((p) => p.score === 0)).toBe(true)
    expect(replayed.seq).toBe(2)
  })
})

describe('stats', () => {
  it('aggregates wins, fouls and concession gifts', () => {
    const initial = three()
    const c = applyAction(initial, { kind: 'startConcession' }, 2)
    const w = applyAction(c.state, { kind: 'win', winType: 'concession' }, 3)
    const f = applyAction(w.state, { kind: 'foul', foulType: 'concession' }, 4)
    const events = [eventFrom(c), eventFrom(w), eventFrom(f)]
    const stats = computeMatchStats(f.state, events)
    const zhang = stats.players.find((p) => p.name === '张三')!
    const li = stats.players.find((p) => p.name === '李四')!
    expect(zhang.wins.concession).toBe(1)
    expect(zhang.wins.concessionSmallGold ?? 0).toBe(0)
    expect(zhang.pointsWon).toBe(8)
    expect(zhang.fouls.concession).toBe(1)
    expect(zhang.fouls.normal).toBe(0)
    expect(li.concessionsGiven).toBe(1)
    expect(li.pointsLost).toBe(8)
    expect(stats.racks).toBe(2)
  })

  it('tracks current and max rack win/lose streaks', () => {
    const s0 = two()
    const a = s0.players[0]!
    const b = s0.players[1]!
    const w1 = applyAction(s0, { kind: 'win', winType: 'normal', playerId: a.id }, 2)
    const w2 = applyAction(w1.state, { kind: 'win', winType: 'normal', playerId: a.id }, 3)
    const w3 = applyAction(w2.state, { kind: 'win', winType: 'normal', playerId: a.id }, 4)
    const w4 = applyAction(w3.state, { kind: 'win', winType: 'normal', playerId: b.id }, 5)
    const events = [w1, w2, w3, w4].map(eventFrom)
    const stats = computeMatchStats(w4.state, events)
    const jia = stats.players.find((p) => p.name === '甲')!
    const yi = stats.players.find((p) => p.name === '乙')!
    expect(jia.maxWinStreak).toBe(3)
    expect(jia.currentWinStreak).toBe(0)
    expect(jia.currentLoseStreak).toBe(1)
    expect(yi.maxLoseStreak).toBe(3)
    expect(yi.currentLoseStreak).toBe(0)
    expect(yi.currentWinStreak).toBe(1)
  })

  it('leaves streak unchanged when a player neither won nor paid', () => {
    const s0 = three()
    const zhang = s0.players.find((p) => p.name === '张三')!
    const w1 = applyAction(s0, { kind: 'win', winType: 'normal', playerId: zhang.id }, 2)
    const w2 = applyAction(w1.state, { kind: 'win', winType: 'normal', playerId: zhang.id }, 3)
    const events = [w1, w2].map(eventFrom)
    const stats = computeMatchStats(w2.state, events)
    const wang = stats.players.find((p) => p.name === '王五')!
    const li = stats.players.find((p) => p.name === '李四')!
    const zhangStats = stats.players.find((p) => p.name === '张三')!
    expect(zhangStats.currentWinStreak).toBe(2)
    expect(wang.currentLoseStreak).toBe(1)
    expect(wang.currentWinStreak).toBe(0)
    expect(li.currentLoseStreak).toBe(1)
    expect(li.currentWinStreak).toBe(0)
  })

  it('does not count fouls toward win or lose streaks', () => {
    const s0 = two()
    const a = s0.players[0]!
    const w1 = applyAction(s0, { kind: 'win', winType: 'normal', playerId: a.id }, 2)
    const w2 = applyAction(w1.state, { kind: 'win', winType: 'normal', playerId: a.id }, 3)
    const f = applyAction(w2.state, { kind: 'foul', foulType: 'normal', playerId: a.id }, 4)
    const w3 = applyAction(f.state, { kind: 'win', winType: 'normal', playerId: a.id }, 5)
    const events = [w1, w2, f, w3].map(eventFrom)
    const stats = computeMatchStats(w3.state, events)
    const jia = stats.players.find((p) => p.name === '甲')!
    const yi = stats.players.find((p) => p.name === '乙')!
    expect(jia.currentWinStreak).toBe(3)
    expect(jia.maxWinStreak).toBe(3)
    expect(jia.currentLoseStreak).toBe(0)
    expect(yi.currentLoseStreak).toBe(3)
    expect(yi.maxLoseStreak).toBe(3)
    expect(yi.currentWinStreak).toBe(0)
  })
})

describe('ended match', () => {
  it('blocks scoring after end, allows reopen', () => {
    const s0 = three()
    const ended = applyAction(s0, { kind: 'endMatch' }, 2).state
    expect(() => applyAction(ended, { kind: 'win', winType: 'normal' }, 3)).toThrow(
      /比赛已结束/,
    )
    const reopened = applyAction(ended, { kind: 'reopenMatch' }, 4).state
    expect(reopened.status).toBe('live')
  })
})

function eight(raceTo = 3) {
  return createMatchState({
    id: 'm8',
    code: 'EIGH',
    names: ['甲', '乙'],
    mode: 'eight',
    raceTo,
    now: 1,
  })
}

describe('中8 race', () => {
  it('creates a 2-player race with 普胜/接清/炸清', () => {
    const s = eight(7)
    expect(s.mode).toBe('eight')
    expect(s.playerCount).toBe(2)
    expect(s.raceTo).toBe(7)
    expect(s.players.map((p) => p.score)).toEqual([0, 0])
  })

  it('rejects 3 players and chase-only win types', () => {
    expect(() =>
      createMatchState({ id: 'x', code: 'X', names: ['A', 'B', 'C'], mode: 'eight' }),
    ).toThrow(/双人/)
    const s0 = eight()
    expect(() => previewWin(s0, 'smallGold')).toThrow(/普胜、接清、炸清/)
    expect(() => previewFoul(s0)).toThrow(/不记犯规/)
  })

  it('普胜 +1 局，赢家继续开球', () => {
    const s0 = eight(5)
    const preview = previewWin(s0, 'normal')
    expect(preview.amount).toBe(1)
    expect(preview.winnerRacks).toBe(1)
    expect(preview.loserRacks).toBe(0)
    expect(preview.matchPoint).toBe(false)
    const { state, event } = applyAction(s0, { kind: 'win', winType: 'normal' }, 2)
    expect(state.players.find((p) => p.name === '甲')?.score).toBe(1)
    expect(state.players.find((p) => p.name === '乙')?.score).toBe(0)
    expect(getRoles(state).ben.name).toBe('甲')
    expect(event.summary).toContain('普胜')
    expect(event.summary).toContain('1-0')
  })

  it('接清、炸清各记 1 局并写入胜型', () => {
    const s0 = eight(5)
    const clear = applyAction(s0, { kind: 'win', winType: 'clear' }, 2)
    expect(clear.event.action).toMatchObject({ kind: 'win', winType: 'clear' })
    expect(clear.state.players.find((p) => p.name === '甲')?.score).toBe(1)
    const boom = applyAction(clear.state, { kind: 'win', winType: 'breakClear', playerId: clear.state.players[1]!.id }, 3)
    expect(boom.event.summary).toContain('炸清')
    expect(boom.state.players.find((p) => p.name === '乙')?.score).toBe(1)
    expect(getRoles(boom.state).ben.name).toBe('乙')
  })

  it('先到抢局数自动结束，撤销后恢复进行', () => {
    const s0 = eight(2)
    const a = s0.players[0]!
    const w1 = applyAction(s0, { kind: 'win', winType: 'clear', playerId: a.id }, 2)
    expect(w1.state.status).toBe('live')
    const w2 = applyAction(w1.state, { kind: 'win', winType: 'breakClear', playerId: a.id }, 3)
    expect(w2.state.status).toBe('ended')
    expect(w2.state.players.find((p) => p.name === '甲')?.score).toBe(2)
    expect(w2.event.summary).toContain('拿下比赛')
    const events: MatchEvent[] = [eventFrom(w1), eventFrom(w2)]
    const stats = computeMatchStats(w2.state, events)
    const jia = stats.players.find((p) => p.name === '甲')!
    expect(jia.wins.clear).toBe(1)
    expect(jia.wins.breakClear).toBe(1)
    expect(jia.score).toBe(2)
    const undone = replay(s0, [
      ...events,
      { id: 'u1', seq: 3, at: 4, action: { kind: 'undo' }, summary: '撤销' },
    ])
    expect(undone.status).toBe('live')
    expect(undone.players.find((p) => p.name === '甲')?.score).toBe(1)
  })
})
