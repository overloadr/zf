import { timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface AdminConfig {
  username: string
  password: string
}

export interface AppConfig {
  admin: AdminConfig
}

export class AuthError extends Error {
  status = 401
  constructor(message = '账号或密码错误') {
    super(message)
    this.name = 'AuthError'
  }
}

type EnvLike = Record<string, string | undefined>

export function resolveConfigPath(env: EnvLike = process.env, cwd = process.cwd()): string {
  if (env.CONFIG_PATH) return path.resolve(env.CONFIG_PATH)
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(cwd, 'data')
  const candidates = [path.join(cwd, 'config.json'), path.join(dataDir, 'config.json')]
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0]!
}

export function loadAppConfig(env: EnvLike = process.env, cwd = process.cwd()): AppConfig | null {
  const fromEnv = adminFromEnv(env)
  const file = readConfigFile(resolveConfigPath(env, cwd))
  const username = fromEnv?.username || file?.admin?.username || ''
  const password = fromEnv?.password || file?.admin?.password || ''
  if (!username.trim() || !password) return null
  return { admin: { username: username.trim(), password } }
}

export function verifyAdmin(
  username: string,
  password: string,
  config: AppConfig | null,
): void {
  if (!config) throw new AuthError('未配置管理员账号')
  const userOk = safeEqual(username.trim(), config.admin.username)
  const passOk = safeEqual(password, config.admin.password)
  if (!userOk || !passOk) throw new AuthError('账号或密码错误')
}

function adminFromEnv(env: EnvLike): AdminConfig | null {
  const username = env.ADMIN_USERNAME?.trim() ?? ''
  const password = env.ADMIN_PASSWORD ?? ''
  if (!username && !password) return null
  if (!username || !password) return null
  return { username, password }
}

function readConfigFile(filePath: string): Partial<AppConfig> | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      admin?: Partial<AdminConfig>
    }
    return raw
  } catch {
    throw new Error(`无法读取配置文件 ${filePath}`)
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}
