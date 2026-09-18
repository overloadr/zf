import { CUE_BY_INDEX, type CueTag } from './labels.ts'
import type { MatchState, Player } from './types.ts'

export interface Roles {
  shang: Player
  ben: Player
  xia: Player
}

export function orderedPlayers(state: MatchState): Player[] {
  const order = state.shotOrder?.length
    ? state.shotOrder
    : [...state.players].sort((a, b) => a.seat - b.seat).map((p) => p.id)
  return order.map((id) => playerById(state, id))
}

export function currentShooter(state: MatchState): Player {
  const list = orderedPlayers(state)
  return list[state.currentIndex] ?? list[0]
}

export function cueIndex(state: MatchState, playerId: string): number {
  const order = orderedPlayers(state).map((p) => p.id)
  const idx = order.indexOf(playerId)
  return idx < 0 ? 0 : idx
}

export function cueTag(state: MatchState, playerId: string): CueTag {
  return CUE_BY_INDEX[cueIndex(state, playerId)] ?? 'break'
}

export function getRoles(state: MatchState, playerId?: string): Roles {
  const list = orderedPlayers(state)
  const n = list.length
  const actorId = playerId ?? currentShooter(state).id
  const idx = Math.max(0, list.findIndex((p) => p.id === actorId))
  const ben = list[idx]
  const shang = list[(idx - 1 + n) % n]
  const xia = list[(idx + 1) % n]
  return { shang, ben, xia }
}

export function playerById(state: MatchState, id: string): Player {
  const found = state.players.find((p) => p.id === id)
  if (!found) throw new Error(`找不到玩家 ${id}`)
  return found
}

export function nextIndex(state: MatchState): number {
  return (state.currentIndex + 1) % state.playerCount
}

export function orderAfterWin(state: MatchState, winnerId: string, loserId: string): string[] {
  const rest = orderedPlayers(state)
    .map((p) => p.id)
    .filter((id) => id !== winnerId && id !== loserId)
  return [winnerId, loserId, ...rest]
}

export function seatedPlayers(state: MatchState): Player[] {
  return [...state.players].sort((a, b) => a.seat - b.seat)
}
