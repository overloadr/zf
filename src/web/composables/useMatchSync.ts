import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import type { MatchEvent, MatchState } from '@engine'
import { ApiError, getMatch } from '../api.ts'
import { pingHealth } from '../net.ts'
import { clearRoomPassword, getRoomPassword, setRoomPassword } from '../roomAccess.ts'
import { usePageResume } from './usePageResume.ts'

const HEARTBEAT_MS = 20_000
const PONG_TIMEOUT_MS = 8_000
const MIN_BACKOFF_MS = 800
const MAX_BACKOFF_MS = 8_000

export function applyIfNewer(
  current: MatchState | null,
  next?: MatchState,
): boolean {
  if (!next) return false
  return !current || next.seq >= current.seq
}

export function useMatchSync(code: Ref<string>) {
  const state = ref<MatchState | null>(null)
  const events = ref<MatchEvent[]>([])
  const connected = ref(false)
  const error = ref('')
  const locked = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: number | undefined
  let heartbeatTimer: number | undefined
  let pongTimer: number | undefined
  let disposed = false
  let gen = 0
  let backoff = MIN_BACKOFF_MS
  let lastAlive = 0

  function applyRecord(record: { state?: MatchState; events?: MatchEvent[] }) {
    if (record.state && applyIfNewer(state.value, record.state)) {
      state.value = record.state
      if (record.events) events.value = record.events
      return
    }
    if (!record.state && record.events) events.value = record.events
  }

  async function load() {
    try {
      const record = await getMatch(code.value)
      locked.value = false
      applyRecord(record)
      return record
    } catch (err) {
      if (err instanceof ApiError && err.needPassword) {
        locked.value = true
        dropSocket()
        stopTimers()
      }
      throw err
    }
  }

  async function unlock(password: string) {
    const value = password.trim()
    if (!value) throw new Error('请输入房间密码')
    setRoomPassword(code.value, value)
    try {
      await load()
    } catch (err) {
      clearRoomPassword(code.value)
      throw err
    }
    connect()
  }

  function stopTimers() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
    if (pongTimer) {
      window.clearTimeout(pongTimer)
      pongTimer = undefined
    }
  }

  function markAlive() {
    lastAlive = Date.now()
    if (pongTimer) {
      window.clearTimeout(pongTimer)
      pongTimer = undefined
    }
  }

  function dropSocket() {
    const socket = ws
    ws = null
    connected.value = false
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    try {
      socket.close()
    } catch {
      /* ignore */
    }
  }

  function sendPing() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
    } catch {
      forceReconnect()
      return
    }
    if (pongTimer) window.clearTimeout(pongTimer)
    pongTimer = window.setTimeout(() => {
      forceReconnect()
    }, PONG_TIMEOUT_MS)
  }

  function startHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer)
    heartbeatTimer = window.setInterval(() => {
      if (disposed || document.visibilityState !== 'visible') return
      sendPing()
    }, HEARTBEAT_MS)
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer || locked.value) return
    if (document.visibilityState !== 'visible') return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, backoff)
    backoff = Math.min(Math.round(backoff * 1.8), MAX_BACKOFF_MS)
  }

  function connect() {
    if (disposed || locked.value) return
    if (document.visibilityState === 'hidden') return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    dropSocket()
    const myGen = ++gen
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const pass = getRoomPassword(code.value)
    const query = new URLSearchParams({ code: code.value })
    if (pass) query.set('password', pass)
    const socket = new WebSocket(`${proto}://${location.host}/ws?${query}`)
    ws = socket
    socket.onopen = () => {
      if (myGen !== gen || ws !== socket) {
        socket.close()
        return
      }
      connected.value = true
      error.value = ''
      backoff = MIN_BACKOFF_MS
      markAlive()
      startHeartbeat()
    }
    socket.onmessage = (ev) => {
      if (myGen !== gen || ws !== socket) return
      markAlive()
      const msg = JSON.parse(String(ev.data)) as {
        type: string
        error?: string
        state?: MatchState
        events?: MatchEvent[]
      }
      if (msg.type === 'pong') return
      applyRecord(msg)
      if (msg.type === 'error') {
        error.value = msg.error ?? '同步失败'
        if ((msg as { needPassword?: boolean }).needPassword) {
          locked.value = true
          dropSocket()
          stopTimers()
        }
      }
      if (msg.type === 'conflict' && msg.error) error.value = msg.error
    }
    socket.onerror = () => {
      if (myGen !== gen || ws !== socket) return
      connected.value = false
    }
    socket.onclose = () => {
      if (myGen !== gen || ws !== socket) return
      ws = null
      connected.value = false
      stopTimers()
      scheduleReconnect()
    }
  }

  function forceReconnect() {
    if (disposed) return
    stopTimers()
    dropSocket()
    backoff = MIN_BACKOFF_MS
    connect()
  }

  function resume(stale: boolean) {
    if (disposed || locked.value) return
    void pingHealth()
    if (stale) {
      void load().catch(() => undefined)
      forceReconnect()
      return
    }
    if (!ws || ws.readyState !== WebSocket.OPEN || Date.now() - lastAlive > HEARTBEAT_MS) {
      forceReconnect()
      return
    }
    sendPing()
    startHeartbeat()
  }

  usePageResume(
    ({ stale }) => resume(stale),
    () => {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
      }
      if (pongTimer) {
        window.clearTimeout(pongTimer)
        pongTimer = undefined
      }
    },
  )

  onMounted(async () => {
    try {
      await load()
      connect()
    } catch (err) {
      if (err instanceof ApiError && err.needPassword) {
        locked.value = true
        error.value = err.message
        return
      }
      error.value = err instanceof Error ? err.message : '加载失败'
      scheduleReconnect()
    }
  })

  onUnmounted(() => {
    disposed = true
    gen += 1
    stopTimers()
    dropSocket()
  })

  return { state, events, connected, error, locked, reload: load, applyRecord, unlock }
}
