import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { AuthError } from './app-config.ts'
import { RuleError } from '../engine/index.ts'

export class RoomAuthError extends AuthError {
  needPassword = true
  constructor(message = '请输入房间密码') {
    super(message)
    this.name = 'RoomAuthError'
  }
}

export function normalizeRoomPassword(raw?: string | null): string | undefined {
  if (raw == null) return undefined
  const value = String(raw).trim()
  if (!value) return undefined
  if (value.length > 32) throw new RuleError('房间密码最多 32 个字符')
  return value
}

export function hashRoomPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const digest = createHash('sha256').update(`${salt}:${password}`).digest('hex')
  return `${salt}:${digest}`
}

export function verifyRoomPassword(password: string, stored: string): boolean {
  const sep = stored.indexOf(':')
  if (sep <= 0) return false
  const salt = stored.slice(0, sep)
  const digest = stored.slice(sep + 1)
  if (!salt || !digest) return false
  const next = createHash('sha256').update(`${salt}:${password}`).digest('hex')
  const left = Buffer.from(next)
  const right = Buffer.from(digest)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
