import { mergeConfig, RuleError } from './config.ts'
import { FOUL_LABELS, WIN_LABELS, isConcessionWinType } from './labels.ts'
import { currentShooter, getRoles, orderAfterWin, orderedPlayers, playerById } from './roles.ts'
import type {
  Action,
  BaseWinType,
  FoulPreview,
  FoulType,
  MatchEvent,
  MatchState,
  Payment,
  Player,
  PlayerCount,
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
  now?: number
}): MatchState {
  const count = opts.names.length
  if (count !== 2 && count !== 3) {
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
  return {
    id: opts.id,
    code: opts.code.toUpperCase(),
    playerCount: count as PlayerCount,
    players,
    shotOrder: players.map((p) => p.id),
    currentIndex: 0,
    concessionActive: false,
    concessionFromId: null,
    status: 'live',
    config: mergeConfig(opts.config),
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
  return {
    ...state,
    config,
    shotOrder,
    currentIndex,
    concessionFromId: state.concessionFromId ?? null,
  }
}

export function previewWin(state: MatchState, winType: WinType, playerId?: string): WinPreview {
  requireLive(state)
  const live = hydrateState(state)
  const actorId = playerId ?? currentShooter(live).id
  const { shang, ben, xia } = getRoles(live, actorId)
  const base = baseWinType(winType)
  const doubled = live.concessionActive || isConcessionWinType(winType)
  const unit = live.config.points[base]
  const each = roundAmount(unit * (doubled ? 2 : 1))
  let payers: Payment[]
  if (doubled) {
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
    : doubled && winType === 'normal'
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
  }
}

export function previewFoul(
  state: MatchState,
  playerId?: string,
  foulType?: FoulType,
): FoulPreview {
  requireLive(state)
  const live = hydrateState(state)
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
  if (preview.payers.length === 1) {
    const pay = preview.payers[0]
    return `从${pay.loserName}赢得 ${formatAmount(preview.amount)} 分`
  }
  const names = preview.payers.map((p) => p.loserName).join('、')
  const each = preview.payers[0]?.amount ?? 0
  return `${names}各赔 ${formatAmount(each)} 分，共 +${formatAmount(preview.amount)}`
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
      for (const pay of preview.payers) {
        transfer(next, preview.winnerId, pay.loserId, pay.amount)
      }
      const { shang } = getRoles(hydrateState(state), preview.winnerId)
      const orderLoser = preview.doubled ? preview.loserId : shang.id
      next.shotOrder = orderAfterWin(next, preview.winnerId, orderLoser)
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
