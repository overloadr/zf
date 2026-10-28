import { applyAction } from './apply.ts'
import { RuleError } from './config.ts'
import { replay } from './replay.ts'
import type { Action, MatchEvent, MatchState } from './types.ts'

export function newEventId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function commitAction(
  initial: MatchState,
  snapshot: MatchState,
  events: MatchEvent[],
  action: Action,
  now = Date.now(),
  eventId = newEventId(),
): { state: MatchState; event: MatchEvent } {
  if (action.kind === 'undo') {
    if (events.length === 0) throw new RuleError('没有可撤销的记录')
    const event: MatchEvent = {
      id: eventId,
      seq: snapshot.seq + 1,
      at: now,
      action: { kind: 'undo' },
      summary: '撤销上一步',
    }
    const state = replay(initial, [...events, event])
    state.seq = event.seq
    state.updatedAt = now
    return { state, event }
  }
  const applied = applyAction(snapshot, action, now)
  return { state: applied.state, event: { id: eventId, ...applied.event } }
}
