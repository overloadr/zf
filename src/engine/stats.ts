import { isConcessionWinType } from './labels.ts'
import { collapseUndos } from './replay.ts'
import type {
  FoulType,
  MatchEvent,
  MatchState,
  MatchStats,
  NamedStats,
  PlayerStats,
  WinType,
} from './types.ts'

function emptyWins(): Record<WinType, number> {
  return {
    normal: 0,
    smallGold: 0,
    bigGold: 0,
    goldenNine: 0,
    concession: 0,
    concessionSmallGold: 0,
  }
}

function emptyFouls(): Record<FoulType, number> {
  return { normal: 0, concession: 0 }
}

export function emptyPlayerStats(playerId: string, name: string, score = 0): PlayerStats {
  return {
    playerId,
    name,
    score,
    wins: emptyWins(),
    fouls: emptyFouls(),
    concessionsGiven: 0,
    pointsWon: 0,
    pointsLost: 0,
    biggestWin: 0,
    racksPlayed: 0,
  }
}

export function computeMatchStats(state: MatchState, events: MatchEvent[]): MatchStats {
  const byId = new Map(
    state.players.map((p) => [p.id, emptyPlayerStats(p.id, p.name, p.score)]),
  )
  let racks = 0
  for (const event of collapseUndos(events)) {
    if (event.action.kind === 'win') {
      racks += 1
      const winner = byId.get(event.winnerId ?? '')
      if (winner) {
        winner.wins[event.action.winType] = (winner.wins[event.action.winType] ?? 0) + 1
        winner.pointsWon += event.amount ?? 0
        winner.biggestWin = Math.max(winner.biggestWin, event.amount ?? 0)
        winner.racksPlayed += 1
      }
      const pays =
        event.payments && event.payments.length > 0
          ? event.payments
          : event.loserId
            ? [{ loserId: event.loserId, amount: event.amount ?? 0 }]
            : []
      for (const pay of pays) {
        const loser = byId.get(pay.loserId)
        if (loser) {
          loser.pointsLost += pay.amount
          if (isConcessionWinType(event.action.winType)) loser.concessionsGiven += 1
        }
      }
    } else if (event.action.kind === 'foul') {
      racks += 1
      const fouler = byId.get(event.playerId ?? event.loserId ?? '')
      if (fouler) {
        fouler.fouls[event.action.foulType] += 1
        fouler.racksPlayed += 1
        fouler.pointsLost += event.amount ?? 0
      }
      const receiver = byId.get(event.winnerId ?? '')
      if (receiver) receiver.pointsWon += event.amount ?? 0
    }
  }
  return {
    matchId: state.id,
    code: state.code,
    racks,
    players: state.players.map((p) => byId.get(p.id)!),
  }
}

export function aggregateNamedStats(
  matches: Array<{ state: MatchState; events: MatchEvent[] }>,
): NamedStats[] {
  const byName = new Map<string, NamedStats>()
  const played = new Map<string, Set<string>>()
  for (const match of matches) {
    const stats = computeMatchStats(match.state, match.events)
    for (const player of stats.players) {
      const name = player.name.trim() || '未命名'
      let row = byName.get(name)
      if (!row) {
        row = {
          name,
          matches: 0,
          score: 0,
          wins: emptyWins(),
          fouls: emptyFouls(),
          concessionsGiven: 0,
          pointsWon: 0,
          pointsLost: 0,
          biggestWin: 0,
          racksPlayed: 0,
        }
        byName.set(name, row)
      }
      const set = played.get(name) ?? new Set()
      set.add(match.state.id)
      played.set(name, set)
      row.score += player.score
      row.concessionsGiven += player.concessionsGiven
      row.pointsWon += player.pointsWon
      row.pointsLost += player.pointsLost
      row.biggestWin = Math.max(row.biggestWin, player.biggestWin)
      row.racksPlayed += player.racksPlayed
      for (const key of Object.keys(player.wins) as WinType[]) {
        row.wins[key] += player.wins[key]
      }
      for (const key of Object.keys(player.fouls) as FoulType[]) {
        row.fouls[key] += player.fouls[key]
      }
    }
  }
  for (const row of byName.values()) {
    row.matches = played.get(row.name)?.size ?? 0
  }
  return [...byName.values()].sort((a, b) => b.score - a.score)
}
