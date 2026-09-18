import type { PointTable, RuleConfig } from './types.ts'

/** 北方常见追分：犯规1、普胜4、小金7、大金10；黄金九与普胜同为4分 */
export const DEFAULT_POINTS: PointTable = {
  foul: 1,
  normal: 4,
  smallGold: 7,
  bigGold: 10,
  goldenNine: 4,
}

export const DEFAULT_CONFIG: RuleConfig = {
  points: { ...DEFAULT_POINTS },
}

export const WIN_TYPES = [
  'normal',
  'smallGold',
  'bigGold',
  'goldenNine',
  'concession',
  'concessionSmallGold',
  'clear',
  'breakClear',
] as const

export const EIGHT_WIN_TYPES = ['normal', 'clear', 'breakClear'] as const

export const DEFAULT_RACE_TO = 7
export const RACE_PRESETS = [5, 7, 9, 11, 13] as const

export function isEightMode(state: { mode?: string }): boolean {
  return state.mode === 'eight'
}

export function isEightWinType(winType: string): winType is (typeof EIGHT_WIN_TYPES)[number] {
  return (EIGHT_WIN_TYPES as readonly string[]).includes(winType)
}

export function normalizeRaceTo(value?: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    throw new RuleError('抢局数须为 1 到 99 的整数')
  }
  return n
}

type LegacyConfig = Partial<RuleConfig> & {
  stake?: number
  multipliers?: Partial<Record<string, number>>
  points?: Partial<PointTable>
}

export function mergeConfig(partial?: LegacyConfig): RuleConfig {
  if (partial?.points) {
    const points = { ...DEFAULT_POINTS, ...partial.points }
    assertPoints(points)
    return { points }
  }
  if (partial?.stake != null || partial?.multipliers) {
    const stake = partial.stake ?? 1
    const m = partial.multipliers ?? {}
    const points: PointTable = {
      foul: 1,
      normal: stake * (m.normal ?? 1),
      smallGold: stake * (m.smallGold ?? 2),
      bigGold: stake * (m.bigGold ?? 3),
      goldenNine: stake * (m.goldenNine ?? 4),
    }
    assertPoints(points)
    return { points }
  }
  return { points: { ...DEFAULT_POINTS } }
}

function assertPoints(points: PointTable): void {
  for (const [key, value] of Object.entries(points)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RuleError(`${key} 分值必须大于等于 0`)
    }
  }
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleError'
  }
}
