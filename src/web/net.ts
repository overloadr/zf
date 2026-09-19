export const REQUEST_TIMEOUT_MS = 8000
export const HEALTH_TIMEOUT_MS = 4000

export class NetworkError extends Error {
  constructor(
    message: string,
    public override cause?: unknown,
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return true
  if (err instanceof TypeError) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  if (init.signal?.aborted) {
    throw new NetworkError('网络超时，请再点一次')
  }
  const onExternalAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onExternalAbort, { once: true })

  return await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new NetworkError('网络超时，请再点一次'))
    }, timeoutMs)
    fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((res) => {
        clearTimeout(timer)
        resolve(res)
      })
      .catch((err) => {
        clearTimeout(timer)
        if (controller.signal.aborted) {
          reject(new NetworkError('网络超时，请再点一次', err))
          return
        }
        reject(new NetworkError('网络异常，请再点一次', err))
      })
      .finally(() => {
        init.signal?.removeEventListener('abort', onExternalAbort)
      })
  })
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts?: { timeoutMs?: number; retries?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? REQUEST_TIMEOUT_MS
  const retries = opts?.retries ?? 0
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs)
    } catch (err) {
      lastError = err
      if (!isTransientNetworkError(err) || attempt === retries) break
      await sleep(200 * (attempt + 1))
    }
  }
  throw lastError
}

export async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `/api/health?t=${Date.now()}`,
      { method: 'GET' },
      HEALTH_TIMEOUT_MS,
    )
    return res.ok
  } catch {
    return false
  }
}
