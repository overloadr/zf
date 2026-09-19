import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithRetry,
  fetchWithTimeout,
  isTransientNetworkError,
  NetworkError,
  pingHealth,
} from './net.ts'
import { applyIfNewer } from './composables/useMatchSync.ts'

describe('network keep-alive helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('times out hung fetches so scoring is not stuck forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    await expect(fetchWithTimeout('/api/health', {}, 20)).rejects.toThrow(NetworkError)
  })

  it('retries a transient GET once', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await fetchWithRetry('/api/health', {}, { retries: 1, timeoutMs: 200 })
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('treats abort and type errors as recoverable network faults', () => {
    expect(isTransientNetworkError(new NetworkError('网络超时，请再点一次'))).toBe(true)
    expect(isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientNetworkError(new Error('比分已被其他设备更新，请核对后再记'))).toBe(false)
  })

  it('does not apply an older snapshot over a newer local score', () => {
    expect(applyIfNewer({ seq: 4 } as never, { seq: 5 } as never)).toBe(true)
    expect(applyIfNewer({ seq: 6 } as never, { seq: 5 } as never)).toBe(false)
    expect(applyIfNewer(null, { seq: 1 } as never)).toBe(true)
  })

  it('health ping swallows network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(pingHealth()).resolves.toBe(false)
  })
})
