import {
  DEFAULT_RACE_TO,
  concessionDoubleEnabled,
  isEightMode,
  isEightWinType,
  mergeConfig,
  normalizeRaceTo,
  normalizeSweepOrder,
  RuleError,
} from './config.ts'
import { FOUL_LABELS, WIN_LABELS, isConcessionWinType } from './labels.ts'
import {
  currentShooter,
  getRoles,
  orderAfterSweep,
  orderAfterWin,
  orderedPlayers,
  playerById,
} from './roles.ts'
import type {
  Action,
  BaseWinType,
  FoulPreview,
  FoulType,
  MatchEvent,
  MatchMode,
  MatchState,
  Payment,
  Player,
  PlayerCount,
  SweepOrder,
  WinPreview,
  WinType,
} from './types.ts'

function cloneState(state: MatchState): MatchState {
  return structuredClone(state)
}

function requireLive(state: MatchState): void {
  if (state.status !== 'live') {
    throw new RuleError('比赛已结束')
  }
}

function others(state: MatchState, winnerId: string): Player[] {
  const seen = new Set<string>()
  const list: Player[] = []
  for (const player of state.players) {
    if (player.id === winnerId || seen.has(player.id)) continue
    seen.add(player.id)
    list.push(player)
  }
  return list
}

function baseWinType(winType: WinType): BaseWinType {
  if (winType === 'concession') return 'normal'
  if (winType === 'concessionSmallGold') return 'smallGold'
  return winType
}

export function createMatchState(opts: {
  id: string
  code: string
  names: string[]
  config?: Parameters<typeof mergeConfig>[0]
  mode?: MatchMode
  raceTo?: number
  sweepOrder?: SweepOrder
  concessionDouble?: boolean
  hasPassword?: boolean
  now?: number
}): MatchState {
  const mode: MatchMode = opts.mode === 'eight' ? 'eight' : 'chase'
  const count = opts.names.length
  if (mode === 'eight') {
    if (count !== 2) throw new RuleError('中八模式为双人')
  } else if (count !== 2 && count !== 3) {
    throw new RuleError('只支持 2 人或 3 人追分')
  }
  const names = opts.names.map((n) => n.trim()).filter(Boolean)
  if (names.length !== count) {
    throw new RuleError('请填写全部玩家姓名')
  }
  const now = opts.now ?? Date.now()
  const players: Player[] = names.map((name, seat) => ({
    id: `${opts.id}-p${seat + 1}`,
    name,
    score: 0,
    seat,
  }))
  const raceTo = mode === 'eight' ? normalizeRaceTo(opts.raceTo ?? DEFAULT_RACE_TO) : undefined
  const sweepOrder =
    mode === 'chase' && count === 3 ? normalizeSweepOrder(opts.sweepOrder) : undefined
  const concessionDouble = mode === 'chase' ? opts.concessionDouble !== false : undefined
  return {
    id: opts.id,
    code: opts.code.toUpperCase(),
    mode,
    playerCount: count as PlayerCount,
    players,
    shotOrder: players.map((p) => p.id),
    currentIndex: 0,
    concessionActive: false,
    concessionFromId: null,
    concessionDouble,
    hasPassword: Boolean(opts.hasPassword),
    status: 'live',
    config: mergeConfig(opts.config),
    raceTo,
    sweepOrder,
    createdAt: now,
    updatedAt: now,
    seq: 0,
  }
}

export function hydrateState(state: MatchState): MatchState {
  const config = mergeConfig(state.config as Parameters<typeof mergeConfig>[0])
  const sorted = [...state.players].sort((a, b) => a.seat - b.seat)
  let shotOrder = state.shotOrder?.filter((id) => sorted.some((p) => p.id === id))
  let currentIndex = state.currentIndex
  if (!shotOrder || shotOrder.length !== sorted.length) {
    shotOrder = []
    for (let i = 0; i < sorted.length; i++) {
      shotOrder.push(sorted[(state.currentIndex + i) % sorted.length]!.id)
    }
    currentIndex = 0
  }
  const mode: MatchMode = state.mode === 'eight' ? 'eight' : 'chase'
  const raceTo =
    mode === 'eight' ? normalizeRaceTo(state.raceTo ?? DEFAULT_RACE_TO) : undefined
  const sweepOrder =
    mode === 'chase' && sorted.length === 3 ? normalizeSweepOrder(state.sweepOrder) : undefined
  const concessionDouble = mode === 'chase' ? concessionDoubleEnabled(state) : undefined
  return {
    ...state,
    mode,
    config,
    shotOrder,
    currentIndex,
    concessionFromId: state.concessionFromId ?? null,
    concessionDouble,
    hasPassword: Boolean(state.hasPassword),
    raceTo,
    sweepOrder,
  }
}

export function previewWin(state: MatchState, winType: WinType, playerId?: string): WinPreview {
  requireLive(state)
  const live = hydrateState(state)
  if (isEightMode(live)) return previewEightWin(live, winType, playerId)
  if (winType === 'clear' || winType === 'breakClear') {
    throw new RuleError('追分模式没有接清 / 炸清')
  }
  const actorId = playerId ?? currentShooter(live).id
  const { shang, ben, xia } = getRoles(live, actorId)
  const base = baseWinType(winType)
  if (base === 'clear' || base === 'breakClear') {
    throw new RuleError('追分模式没有接清 / 炸清')
  }
  const concessionPlay = live.concessionActive || isConcessionWinType(winType)
  const doubled = concessionPlay && concessionDoubleEnabled(live)
  const unit = live.config.points[base]
  const each = roundAmount(unit * (doubled ? 2 : 1))
  let payers: Payment[]
  if (concessionPlay) {
    const from = live.concessionFromId
      ? live.players.find((p) => p.id === live.concessionFromId) ?? xia
      : xia
    payers = [{ loserId: from.id, loserName: from.name, amount: each }]
  } else if (base === 'bigGold' || base === 'goldenNine') {
    payers = others(live, ben.id).map((p) => ({
      loserId: p.id,
      loserName: p.name,
      amount: each,
    }))
  } else {
    payers = [{ loserId: shang.id, loserName: shang.name, amount: each }]
  }
  const recordType: WinType = isConcessionWinType(winType)
    ? winType
    : concessionPlay && winType === 'normal'
      ? 'concession'
      : base
  const amount = roundAmount(payers.reduce((sum, p) => sum + p.amount, 0))
  const first = payers[0]
  return {
    winType: recordType,
    winnerId: ben.id,
    winnerName: ben.name,
    loserId: first.loserId,
    loserName: first.loserName,
    amount,
    payers,
    doubled,
    concession: concessionPlay,
  }
}

function previewEightWin(state: MatchState, winType: WinType, playerId?: string): WinPreview {
  if (!isEightWinType(winType)) {
    throw new RuleError('中八只记普胜、接清、炸清')
  }
  const actorId = playerId ?? currentShooter(state).id
  const { ben } = getRoles(state, actorId)
  const opponent = others(state, ben.id)[0]
  if (!opponent) throw new RuleError('中八需要两名玩家')
  const raceTo = state.raceTo ?? DEFAULT_RACE_TO
  const winnerRacks = ben.score + 1
  const doubled = false
  return {
    winType,
    winnerId: ben.id,
    winnerName: ben.name,
    loserId: opponent.id,
    loserName: opponent.name,
    amount: 1,
    payers: [{ loserId: opponent.id, loserName: opponent.name, amount: 1 }],
    doubled,
    concession: false,
    winnerRacks,
    loserRacks: opponent.score,
    raceTo,
    matchPoint: winnerRacks >= raceTo,
  }
}

export function previewFoul(
  state: MatchState,
  playerId?: string,
  foulType?: FoulType,
): FoulPreview {
  requireLive(state)
  const live = hydrateState(state)
  if (isEightMode(live)) throw new RuleError('中八不记犯规分')
  const actorId = playerId ?? currentShooter(live).id
  const { shang, ben, xia } = getRoles(live, actorId)
  const concessionFoul = live.concessionActive || foulType === 'concession'
  const receiver = concessionFoul
    ? live.players.find((p) => p.id === live.concessionFromId) ?? xia
    : shang
  return {
    foulType: concessionFoul ? 'concession' : 'normal',
    foulerId: ben.id,
    foulerName: ben.name,
    receiverId: receiver.id,
    receiverName: receiver.name,
    amount: live.config.points.foul,
  }
}

export function formatSettlement(preview: WinPreview): string {
  if (preview.winnerRacks != null && preview.loserRacks != null) {
    const line = `${preview.winnerRacks}-${preview.loserRacks}`
    if (preview.matchPoint) return `以 ${line} 拿下比赛`
    return `本局 ${line}（抢${preview.raceTo ?? DEFAULT_RACE_TO}）`
  }
  if (preview.payers.length === 1) {
    const pay = preview.payers[0]
    return `从${pay.loserName}赢得 ${formatAmount(preview.amount)} 分`
  }
  const names = preview.payers.map((p) => p.loserName).join('、')
  const each = preview.payers[0]?.amount ?? 0
  return `${names}各赔 ${formatAmount(each)} 分，共 +${formatAmount(preview.amount)}`
}

function isSweepWin(state: MatchState, preview: WinPreview): boolean {
  return (
    state.playerCount === 3 &&
    !preview.doubled &&
    (preview.winType === 'bigGold' || preview.winType === 'goldenNine')
  )
}

export function applyAction(
  state: MatchState,
  action: Exclude<Action, { kind: 'undo' }>,
  now = Date.now(),
): { state: MatchState; event: Omit<MatchEvent, 'id'> } {
  if (action.kind !== 'reopenMatch') requireLive(state)

  const next = hydrateState(cloneState(state))
  next.updatedAt = now
  next.seq = state.seq + 1

  switch (action.kind) {
    case 'win': {
      const preview = previewWin(state, action.winType, action.playerId)
      if (isEightMode(next)) {
        const winner = next.players.find((p) => p.id === preview.winnerId)
        if (!winner) throw new RuleError('结算玩家不存在')
        winner.score += 1
        next.shotOrder = orderAfterWin(next, preview.winnerId, preview.loserId)
        if (winner.score >= (next.raceTo ?? DEFAULT_RACE_TO)) next.status = 'ended'
      } else {
        for (const pay of preview.payers) {
          transfer(next, preview.winnerId, pay.loserId, pay.amount)
        }
        const before = hydrateState(state)
        if (isSweepWin(before, preview)) {
          next.shotOrder = orderAfterSweep(
            before,
            preview.winnerId,
            before.sweepOrder ?? 'keep',
            now + next.seq * 1_000_003,
          )
        } else {
          const { shang } = getRoles(before, preview.winnerId)
          const orderLoser = preview.concession ? preview.loserId : shang.id
          next.shotOrder = orderAfterWin(before, preview.winnerId, orderLoser)
        }
      }
      next.currentIndex = 0
      next.concessionActive = false
      next.concessionFromId = null
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action: { kind: 'win', winType: preview.winType, playerId: preview.winnerId },
          summary: `${preview.winnerName} ${WIN_LABELS[preview.winType]}${preview.doubled && !isConcessionWinType(preview.winType) ? '（让杆双倍）' : ''}，${formatSettlement(preview)}`,
          amount: preview.amount,
          winnerId: preview.winnerId,
          loserId: preview.loserId,
          payments: preview.payers,
        },
      }
    }
    case 'foul': {
      const preview = previewFoul(state, action.playerId, action.foulType)
      transfer(next, preview.receiverId, preview.foulerId, preview.amount)
      const order = orderedPlayers(next).map((p) => p.id)
      const idx = Math.max(0, order.indexOf(preview.foulerId))
      next.currentIndex = (idx + 1) % next.playerCount
      next.concessionActive = false
      next.concessionFromId = null
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action: { kind: 'foul', foulType: preview.foulType, playerId: preview.foulerId },
          summary: `${preview.foulerName} ${FOUL_LABELS[preview.foulType]}，赔${preview.receiverName} ${formatAmount(preview.amount)} 分`,
          amount: preview.amount,
          winnerId: preview.receiverId,
          loserId: preview.foulerId,
          playerId: preview.foulerId,
        },
      }
    }
    case 'startConcession': {
      if (isEightMode(next)) throw new RuleError('中八没有让杆')
      if (state.concessionActive) throw new RuleError('已经在让杆中')
      const live = hydrateState(state)
      const shooter = currentShooter(live)
      const from = action.playerId ? playerById(live, action.playerId) : getRoles(live).xia
      if (from.id === shooter.id) throw new RuleError('不能给自己让杆')
      next.concessionActive = true
      next.concessionFromId = from.id
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action: { kind: 'startConcession', playerId: from.id },
          summary: `${from.name} 让杆给 ${shooter.name}`,
          playerId: from.id,
        },
      }
    }
    case 'cancelConcession': {
      if (!state.concessionActive) throw new RuleError('当前没有让杆')
      const fromName =
        next.players.find((p) => p.id === state.concessionFromId)?.name ?? getRoles(state).xia.name
      next.concessionActive = false
      next.concessionFromId = null
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action,
          summary: `取消 ${fromName} 的让杆`,
          playerId: state.concessionFromId ?? undefined,
        },
      }
    }
    case 'rename': {
      const name = action.name.trim()
      if (!name) throw new RuleError('姓名不能为空')
      const player = next.players.find((p) => p.id === action.playerId)
      if (!player) throw new RuleError('找不到该玩家')
      const old = player.name
      player.name = name
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action: { kind: 'rename', playerId: action.playerId, name },
          summary: `${old} 改名为 ${name}`,
          playerId: action.playerId,
        },
      }
    }
    case 'endMatch': {
      next.status = 'ended'
      next.concessionActive = false
      next.concessionFromId = null
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action,
          summary: '结束本场比赛',
        },
      }
    }
    case 'reopenMatch': {
      if (state.status !== 'ended') throw new RuleError('比赛进行中，无需恢复')
      next.status = 'live'
      return {
        state: next,
        event: {
          seq: next.seq,
          at: now,
          action,
          summary: '恢复本场比赛',
        },
      }
    }
    default: {
      const _never: never = action
      throw new RuleError(`未知动作: ${JSON.stringify(_never)}`)
    }
  }
}

function transfer(state: MatchState, winnerId: string, loserId: string, amount: number): void {
  const winner = state.players.find((p) => p.id === winnerId)
  const loser = state.players.find((p) => p.id === loserId)
  if (!winner || !loser) throw new RuleError('结算玩家不存在')
  winner.score = roundAmount(winner.score + amount)
  loser.score = roundAmount(loser.score - amount)
}

export function roundAmount(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatAmount(n: number): string {
  const rounded = roundAmount(n)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}
