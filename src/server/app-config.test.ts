import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthError, loadAppConfig, verifyAdmin } from './app-config.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-cfg-'))
  dirs.push(dir)
  return dir
}

describe('app config', () => {
  it('loads admin from config.json', () => {
    const dir = tmp()
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ admin: { username: 'root', password: 'secret' } }),
    )
    const cfg = loadAppConfig({}, dir)
    expect(cfg?.admin).toEqual({ username: 'root', password: 'secret' })
    expect(() => verifyAdmin('root', 'secret', cfg)).not.toThrow()
    expect(() => verifyAdmin('root', 'wrong', cfg)).toThrow(AuthError)
  })

  it('prefers env over the config file', () => {
    const dir = tmp()
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ admin: { username: 'file', password: 'file-pass' } }),
    )
    const cfg = loadAppConfig(
      { ADMIN_USERNAME: 'env-admin', ADMIN_PASSWORD: 'env-pass' },
      dir,
    )
    expect(cfg?.admin.username).toBe('env-admin')
    expect(() => verifyAdmin('env-admin', 'env-pass', cfg)).not.toThrow()
  })

  it('returns null when nothing is configured', () => {
    const dir = tmp()
    expect(loadAppConfig({}, dir)).toBeNull()
    expect(() => verifyAdmin('a', 'b', null)).toThrow(/未配置管理员账号/)
  })
})
