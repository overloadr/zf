import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from './net.ts'
import { postAction } from './api.ts'

describe('postAction recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reuses the latest match when a timed-out POST already applied', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/actions')) {
        throw new TypeError('Failed to fetch')
      }
      return new Response(
        JSON.stringify({
          state: { seq: 2, code: 'ABCD' },
          events: [{ seq: 2 }],
          initial: { seq: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const record = await postAction('ABCD', { kind: 'undo' }, 1)
    expect(record.state.seq).toBe(2)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/actions'))).toBe(true)
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/actions'))).toHaveLength(1)
  })

  it('retries the POST when the match seq has not moved', async () => {
    let actionCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/actions')) {
        actionCalls += 1
        if (actionCalls === 1) throw new TypeError('Failed to fetch')
        return new Response(
          JSON.stringify({
            state: { seq: 2, code: 'ABCD' },
            events: [{ seq: 2 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          state: { seq: 1, code: 'ABCD' },
          events: [],
          initial: { seq: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const record = await postAction('ABCD', { kind: 'undo' }, 1)
    expect(record.state.seq).toBe(2)
    expect(actionCalls).toBe(2)
  })
})
