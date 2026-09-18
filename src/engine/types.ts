export type PlayerCount = 2 | 3

export type WinType =
  | 'normal'
  | 'smallGold'
  | 'bigGold'
  | 'goldenNine'
  | 'concession'
  | 'concessionSmallGold'

export type FoulType = 'normal' | 'concession'

export type BaseWinType = Exclude<WinType, 'concession' | 'concessionSmallGold'>

export interface PointTable {
  foul: number
  normal: number
  smallGold: number
  bigGold: number
  goldenNine: number
}

export interface RuleConfig {
  points: PointTable
}

export interface Player {
  id: string
  name: string
  score: number
  seat: number
}

export type MatchStatus = 'live' | 'ended'

export interface MatchState {
  id: string
  code: string
  playerCount: PlayerCount
  players: Player[]
  shotOrder: string[]
  currentIndex: number
  concessionActive: boolean
  concessionFromId: string | null
  status: MatchStatus
  config: RuleConfig
  createdAt: number
  updatedAt: number
  seq: number
}

export type Action =
  | { kind: 'win'; winType: WinType; playerId?: string }
  | { kind: 'foul'; foulType: FoulType; playerId?: string }
  | { kind: 'startConcession'; playerId?: string }
  | { kind: 'cancelConcession' }
  | { kind: 'rename'; playerId: string; name: string }
  | { kind: 'endMatch' }
  | { kind: 'reopenMatch' }
  | { kind: 'undo' }

export interface Payment {
  loserId: string
  loserName: string
  amount: number
}

export interface MatchEvent {
  id: string
  seq: number
  at: number
  action: Exclude<Action, { kind: 'undo' }> | { kind: 'undo' }
  summary: string
  amount?: number
  winnerId?: string
  loserId?: string
  playerId?: string
  payments?: Payment[]
}

export interface WinPreview {
  winType: WinType
  winnerId: string
  winnerName: string
  loserId: string
  loserName: string
  amount: number
  payers: Payment[]
  doubled: boolean
}

export interface FoulPreview {
  foulType: FoulType
  foulerId: string
  foulerName: string
  receiverId: string
  receiverName: string
  amount: number
}

export interface PlayerStats {
  playerId: string
  name: string
  score: number
  wins: Record<WinType, number>
  fouls: Record<FoulType, number>
  concessionsGiven: number
  pointsWon: number
  pointsLost: number
  biggestWin: number
  racksPlayed: number
}

export interface MatchStats {
  matchId: string
  code: string
  racks: number
  players: PlayerStats[]
}

export interface NamedStats {
  name: string
  matches: number
  score: number
  wins: Record<WinType, number>
  fouls: Record<FoulType, number>
  concessionsGiven: number
  pointsWon: number
  pointsLost: number
  biggestWin: number
  racksPlayed: number
}
