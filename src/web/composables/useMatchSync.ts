import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import type { MatchEvent, MatchState } from '@engine'
import { getMatch } from '../api.ts'

export function useMatchSync(code: Ref<string>) {
  const state = ref<MatchState | null>(null)
  const events = ref<MatchEvent[]>([])
  const connected = ref(false)
  const error = ref('')
  let ws: WebSocket | null = null
  let timer: number | undefined
  let disposed = false

  async function load() {
    const record = await getMatch(code.value)
    state.value = record.state
    events.value = record.events
  }

  function connect() {
    if (disposed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws?code=${code.value}`)
    ws.onopen = () => {
      connected.value = true
      error.value = ''
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        type: string
        error?: string
        state?: MatchState
        events?: MatchEvent[]
      }
      if (msg.state) state.value = msg.state
      if (msg.events) events.value = msg.events
      if (msg.type === 'error') error.value = msg.error ?? '同步失败'
      if (msg.type === 'conflict' && msg.error) error.value = msg.error
    }
    ws.onclose = () => {
      connected.value = false
      ws = null
      if (!disposed) timer = window.setTimeout(connect, 1200)
    }
  }

  onMounted(async () => {
    try {
      await load()
      connect()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败'
    }
  })

  onUnmounted(() => {
    disposed = true
    if (timer) window.clearTimeout(timer)
    ws?.close()
  })

  return { state, events, connected, error, reload: load }
}
