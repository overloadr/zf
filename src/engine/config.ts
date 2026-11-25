import type { PointTable, RuleConfig, SweepOrder } from './types.ts'

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
  'worldGold',
  'concessionWorldGold',
  'clear',
  'breakClear',
] as const

export const EIGHT_WIN_TYPES = ['normal', 'clear', 'breakClear'] as const

export const DEFAULT_RACE_TO = 7
export const RACE_PRESETS = [5, 7, 9, 11, 13] as const
export const RACK_LIMIT_PRESETS = [10, 20, 30, 50] as const
export const TIME_LIMIT_PRESETS = [30, 45, 60, 90] as const
export const SWEEP_ORDERS = ['keep', 'rotate', 'random'] as const

export function normalizeSweepOrder(value?: string): SweepOrder {
  if (value === 'rotate' || value === 'random') return value
  return 'keep'
}

export function isEightMode(state: { mode?: string }): boolean {
  return state.mode === 'eight'
}

export function concessionDoubleEnabled(state: { concessionDouble?: boolean }): boolean {
  return state.concessionDouble !== false
}

export function worldGoldEnabled(state: { worldGold?: boolean }): boolean {
  return Boolean(state.worldGold)
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

function optionalInt(value: unknown, min: number, max: number, label: string, strict: boolean): number | undefined {
  if (value == null || value === '' || value === false) return undefined
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n === 0) return undefined
  if (n < min || n > max) {
    if (!strict) return undefined
    throw new RuleError(`${label}须为 ${min} 到 ${max} 的整数`)
  }
  return n
}

export function normalizeRackLimit(value?: number, strict = true): number | undefined {
  return optionalInt(value, 1, 99, '局数', strict)
}

export function normalizeTimeLimitMin(value?: number, strict = true): number | undefined {
  return optionalInt(value, 1, 600, '倒计时（分钟）', strict)
}

export function chaseEndsAt(state: { createdAt: number; timeLimitMin?: number }): number | undefined {
  if (!state.timeLimitMin) return undefined
  return state.createdAt + state.timeLimitMin * 60_000
}

export function chaseRemainingMs(
  state: { createdAt: number; timeLimitMin?: number },
  now = Date.now(),
): number | undefined {
  const endsAt = chaseEndsAt(state)
  if (endsAt == null) return undefined
  return endsAt - now
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
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
