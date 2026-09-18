import { applyAction } from './apply.ts'
import type { MatchEvent, MatchState } from './types.ts'

export function collapseUndos(events: MatchEvent[]): MatchEvent[] {
  const stack: MatchEvent[] = []
  for (const event of events) {
    if (event.action.kind === 'undo') {
      stack.pop()
      continue
    }
    stack.push(event)
  }
  return stack
}

export function replay(initial: MatchState, events: MatchEvent[]): MatchState {
  let state = structuredClone(initial)
  for (const event of collapseUndos(events)) {
    if (event.action.kind === 'undo') continue
    const applied = applyAction(state, actionWithActor(event), event.at)
    applied.state.seq = event.seq
    state = applied.state
  }
  state.seq = events.at(-1)?.seq ?? initial.seq
  state.updatedAt = events.at(-1)?.at ?? initial.updatedAt
  return state
}

function actionWithActor(event: MatchEvent): Exclude<MatchEvent['action'], { kind: 'undo' }> {
  const action = event.action
  if (action.kind === 'undo') {
    throw new Error('undo')
  }
  if (action.kind === 'win' && !action.playerId && event.winnerId) {
    return { ...action, playerId: event.winnerId }
  }
  if (action.kind === 'foul' && !action.playerId && event.playerId) {
    return { ...action, playerId: event.playerId }
  }
  if (action.kind === 'startConcession' && !action.playerId && event.playerId) {
    return { ...action, playerId: event.playerId }
  }
  return action
}
