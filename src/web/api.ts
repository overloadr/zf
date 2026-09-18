import type { Action, MatchEvent, MatchState, MatchStats, NamedStats } from '@engine'

const jsonHeaders = { 'Content-Type': 'application/json' }

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: MatchState,
    public events?: MatchEvent[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    state?: MatchState
    events?: MatchEvent[]
  } & T
  if (!res.ok) {
    throw new ApiError(data.error || '请求失败', res.status, data.state, data.events)
  }
  return data
}

export async function listMatches(status: 'live' | 'ended' | 'all' = 'all') {
  return parse<{ matches: MatchState[] }>(await fetch(`/api/matches?status=${status}`))
}

export async function createMatch(body: {
  names: string[]
  points?: Record<string, number>
}) {
  return parse<{ state: MatchState }>(
    await fetch('/api/matches', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  )
}

export async function getMatch(code: string) {
  return parse<{ state: MatchState; events: MatchEvent[]; initial: MatchState }>(
    await fetch(`/api/matches/${code}`),
  )
}

export async function postAction(code: string, action: Action, expectedSeq: number) {
  return parse<{ state: MatchState; events: MatchEvent[] }>(
    await fetch(`/api/matches/${code}/actions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ action, expectedSeq }),
    }),
  )
}

export async function getMatchStats(code: string) {
  return parse<MatchStats>(await fetch(`/api/matches/${code}/stats`))
}

export async function getGlobalStats() {
  return parse<{ players: NamedStats[]; matchCount: number }>(await fetch('/api/stats'))
}
