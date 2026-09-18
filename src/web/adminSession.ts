export const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000
const KEY = 'zf-admin-session'

export interface AdminSession {
  username: string
  password: string
  expiresAt: number
}

function storage(): Storage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

export function readAdminSession(now = Date.now()): { username: string; password: string } | null {
  const store = storage()
  if (!store) return null
  const raw = store.getItem(KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as AdminSession
    if (!data.username || !data.password || !Number.isFinite(data.expiresAt) || data.expiresAt <= now) {
      store.removeItem(KEY)
      return null
    }
    return { username: data.username, password: data.password }
  } catch {
    store.removeItem(KEY)
    return null
  }
}

export function saveAdminSession(username: string, password: string, now = Date.now()): void {
  const store = storage()
  if (!store) return
  const session: AdminSession = {
    username: username.trim(),
    password,
    expiresAt: now + ADMIN_SESSION_TTL_MS,
  }
  store.setItem(KEY, JSON.stringify(session))
}

export function clearAdminSession(): void {
  storage()?.removeItem(KEY)
}
