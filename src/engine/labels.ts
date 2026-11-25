import { chaseRemainingMs, formatClock } from './config.ts'
import type { FoulType, MatchState, SweepOrder, WinType } from './types.ts'

export const WIN_LABELS: Record<WinType, string> = {
  normal: '普胜',
  smallGold: '小金',
  bigGold: '大金',
  goldenNine: '黄金九',
  concession: '让杆普胜',
  concessionSmallGold: '让杆小金',
  worldGold: '全球大金',
  concessionWorldGold: '让杆全球大金',
  clear: '接清',
  breakClear: '炸清',
}

export function isConcessionWinType(winType: WinType): boolean {
  return (
    winType === 'concession' ||
    winType === 'concessionSmallGold' ||
    winType === 'concessionWorldGold'
  )
}

export function isWorldGoldType(winType: WinType): boolean {
  return winType === 'worldGold' || winType === 'concessionWorldGold'
}

export const FOUL_LABELS: Record<FoulType, string> = {
  normal: '普通犯规',
  concession: '让杆犯规',
}

export const ROLE_LABELS = {
  shang: '上家',
  ben: '本家',
  xia: '下家',
} as const

export type CueTag = 'break' | 'second' | 'third'

export const CUE_LABELS: Record<CueTag, string> = {
  break: '大杆',
  second: '二杆',
  third: '三杆',
}

export const CUE_BY_INDEX: CueTag[] = ['break', 'second', 'third']

export function seatLabel(playerCount: 2 | 3, seat: number): string {
  if (playerCount === 2) return seat === 0 ? '上' : '下'
  return ['上', '中', '下'][seat] ?? `${seat + 1}`
}

export function matchKindLabel(
  state: Pick<MatchState, 'mode' | 'playerCount' | 'raceTo' | 'rackLimit' | 'timeLimitMin'>,
): string {
  if (state.mode === 'eight') return `中八 · 抢${state.raceTo ?? 7}`
  const bits = [`${state.playerCount}人追分`]
  if (state.rackLimit) bits.push(`${state.rackLimit}局`)
  if (state.timeLimitMin) bits.push(`${state.timeLimitMin}分钟`)
  return bits.join(' · ')
}

export function chaseLimitLine(
  state: Pick<MatchState, 'mode' | 'rackLimit' | 'rackCount' | 'timeLimitMin' | 'createdAt'>,
  now = Date.now(),
): string {
  if (state.mode === 'eight') return ''
  const parts: string[] = []
  if (state.rackLimit) parts.push(`${state.rackCount ?? 0}/${state.rackLimit} 局`)
  const left = chaseRemainingMs(state, now)
  if (left != null) parts.push(left <= 0 ? '时间到' : formatClock(left))
  return parts.join(' · ')
}

export function chaseEndedText(
  state: Pick<MatchState, 'mode' | 'rackLimit' | 'rackCount' | 'timeLimitMin' | 'createdAt'>,
  now = Date.now(),
): string {
  if (state.mode === 'eight') return '本场已结束'
  if (state.rackLimit && (state.rackCount ?? 0) >= state.rackLimit) return `已打满 ${state.rackLimit} 局`
  const left = chaseRemainingMs(state, now)
  if (left != null && left <= 0) return '时间到，本场已结束'
  return '本场已结束'
}

export const SWEEP_ORDER_LABELS: Record<SweepOrder, string> = {
  keep: '保持不变',
  rotate: '轮换',
  random: '随机',
}
