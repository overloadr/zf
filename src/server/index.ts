import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateNamedStats,
  computeMatchStats,
  RuleError,
  type Action,
} from '../engine/index.ts'
import { AuthError, loadAppConfig, verifyAdmin } from './app-config.ts'
import { openDatabase } from './db.ts'
import { Hub } from './hub.ts'
import { RoomAuthError } from './room-password.ts'
import { ConflictError, MatchStore } from './store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

async function main() {
  const db = openDatabase()
  const store = new MatchStore(db)
  const hub = new Hub()
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['Content-Type', 'X-Match-Password'],
  })
  await app.register(websocket)

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/matches', async (req) => {
    const q = req.query as { status?: string; from?: string; to?: string }
    const status =
      q.status === 'live' || q.status === 'ended' || q.status === 'all' ? q.status : 'all'
    return {
      matches: store.list({
        status,
        from: parseMs(q.from),
        to: parseMs(q.to),
      }),
    }
  })

  app.post('/api/matches', async (req, reply) => {
    const body = req.body as {
      names?: string[]
      points?: Record<string, number>
      mode?: 'chase' | 'eight'
      raceTo?: number
      sweepOrder?: 'keep' | 'rotate' | 'random'
      concessionDouble?: boolean
      password?: string
    }
    try {
      const state = store.create({
        names: body.names ?? [],
        config: body.points ? { points: body.points as never } : undefined,
        mode: body.mode,
        raceTo: body.raceTo,
        sweepOrder: body.sweepOrder,
        concessionDouble: body.concessionDouble,
        password: body.password,
      })
      return reply.code(201).send({ state })
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/matches/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    try {
      store.assertAccess(code, readRoomPassword(req))
    } catch (err) {
      return sendError(reply, err)
    }
    const record = store.getByCode(code)
    if (!record) return reply.code(404).send({ error: '找不到这场比赛' })
    return record
  })

  app.delete('/api/matches/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const body = req.body as { username?: string; password?: string }
    try {
      verifyAdmin(body.username ?? '', body.password ?? '', loadAppConfig())
      const state = store.deleteEnded(code)
      hub.drop(state.code)
      return { ok: true, code: state.code }
    } catch (err) {
      if (err instanceof RuleError && err.message === '找不到这场比赛') {
        return reply.code(404).send({ error: err.message })
      }
      return sendError(reply, err)
    }
  })

  app.get('/api/matches/:code/stats', async (req, reply) => {
    const { code } = req.params as { code: string }
    try {
      store.assertAccess(code, readRoomPassword(req))
    } catch (err) {
      return sendError(reply, err)
    }
    const record = store.getByCode(code)
    if (!record) return reply.code(404).send({ error: '找不到这场比赛' })
    return computeMatchStats(record.state, record.events)
  })

  app.get('/api/stats', async () => {
    const records = store.allRecords()
    return {
      players: aggregateNamedStats(
        records.map((r) => ({ state: r.state, events: r.events })),
      ),
      matchCount: records.length,
    }
  })

  app.post('/api/matches/:code/actions', async (req, reply) => {
    const { code } = req.params as { code: string }
    const body = req.body as { action?: Action; expectedSeq?: number; password?: string }
    if (!body.action) return reply.code(400).send({ error: '缺少动作' })
    try {
      store.assertAccess(code, readRoomPassword(req) || body.password)
      const record = store.apply(code, body.action, body.expectedSeq)
      hub.broadcast(record.state.code, record)
      return record
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, 'http://localhost')
    const code = (url.searchParams.get('code') ?? '').toUpperCase()
    const password = url.searchParams.get('password') ?? ''
    if (!code) {
      socket.close()
      return
    }
    try {
      store.assertAccess(code, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : '需要房间密码'
      socket.send(JSON.stringify({ type: 'error', error: message, needPassword: true }))
      socket.close()
      return
    }
    const record = store.getByCode(code)
    if (!record) {
      socket.send(JSON.stringify({ type: 'error', error: '找不到这场比赛' }))
      socket.close()
      return
    }
    hub.join(code, socket)
    socket.send(
      JSON.stringify({ type: 'match', state: record.state, events: record.events }),
    )
    const beat = setInterval(() => {
      if (socket.readyState === 1) {
        try {
          socket.ping()
        } catch {
          /* ignore */
        }
      }
    }, 25_000)
    const stopBeat = () => clearInterval(beat)
    socket.on('close', stopBeat)
    socket.on('error', stopBeat)
    socket.on('message', (raw: Buffer | ArrayBuffer | string) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string
          t?: number
          action?: Action
          expectedSeq?: number
        }
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', t: msg.t ?? Date.now() }))
          return
        }
        if (!msg.action) return
        const next = store.apply(code, msg.action, msg.expectedSeq)
        hub.broadcast(code, next)
      } catch (err) {
        const message = err instanceof Error ? err.message : '操作失败'
        const payload =
          err instanceof ConflictError
            ? { type: 'conflict', error: message, state: err.record.state, events: err.record.events }
            : { type: 'error', error: message }
        socket.send(JSON.stringify(payload))
      }
    })
  })

  const webDir = path.resolve(__dirname, '../../dist/web')
  if (fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  await app.listen({ port: PORT, host: HOST })
  const server = app.server as typeof app.server & {
    keepAliveTimeout: number
    headersTimeout: number
  }
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 66_000
}

function parseMs(value?: string): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function readRoomPassword(req: {
  headers: Record<string, unknown>
  query?: unknown
}): string {
  const header = req.headers['x-match-password']
  if (typeof header === 'string' && header.trim()) return header
  if (Array.isArray(header) && typeof header[0] === 'string') return header[0]
  const query = req.query as { password?: string } | undefined
  if (typeof query?.password === 'string') return query.password
  return ''
}

function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof RoomAuthError) {
    return reply.code(err.status).send({ error: err.message, needPassword: true })
  }
  if (err instanceof AuthError) {
    return reply.code(err.status).send({ error: err.message })
  }
  if (err instanceof ConflictError) {
    return reply.code(409).send({
      error: err.message,
      state: err.record.state,
      events: err.record.events,
    })
  }
  if (err instanceof RuleError) {
    return reply.code(400).send({ error: err.message })
  }
  const message = err instanceof Error ? err.message : '服务器错误'
  return reply.code(500).send({ error: message })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
