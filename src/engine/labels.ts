import type { FoulType, MatchState, SweepOrder, WinType } from './types.ts'

export const WIN_LABELS: Record<WinType, string> = {
  normal: '普胜',
  smallGold: '小金',
  bigGold: '大金',
  goldenNine: '黄金九',
  concession: '让杆普胜',
  concessionSmallGold: '让杆小金',
  clear: '接清',
  breakClear: '炸清',
}

export function isConcessionWinType(winType: WinType): boolean {
  return winType === 'concession' || winType === 'concessionSmallGold'
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

export function matchKindLabel(state: Pick<MatchState, 'mode' | 'playerCount' | 'raceTo'>): string {
  if (state.mode === 'eight') return `中八 · 抢${state.raceTo ?? 7}`
  return `${state.playerCount}人追分`
}

export const SWEEP_ORDER_LABELS: Record<SweepOrder, string> = {
  keep: '保持不变',
  rotate: '轮换',
  random: '随机',
}
