const PREFIX = 'zf:room:'

function key(code: string): string {
  return PREFIX + code.trim().toUpperCase()
}

export function getRoomPassword(code: string): string {
  if (!code) return ''
  try {
    return localStorage.getItem(key(code)) ?? ''
  } catch {
    return ''
  }
}

export function setRoomPassword(code: string, password: string): void {
  if (!code) return
  try {
    const value = password.trim()
    if (!value) localStorage.removeItem(key(code))
    else localStorage.setItem(key(code), value)
  } catch {
    /* private mode */
  }
}

export function clearRoomPassword(code: string): void {
  if (!code) return
  try {
    localStorage.removeItem(key(code))
  } catch {
    /* ignore */
  }
}

export function roomPasswordHeaders(code: string): Record<string, string> {
  const password = getRoomPassword(code)
  return password ? { 'X-Match-Password': password } : {}
}
