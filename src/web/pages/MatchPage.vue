<template>
  <div class="page match-page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.push('/')">大厅</button>
      <div class="center">
        <div class="code">{{ code }}</div>
        <p class="sub">{{ connected ? '实时同步中' : '正在恢复连接…' }}</p>
      </div>
      <button class="btn btn-ghost" @click="shareOpen = true">分享</button>
    </header>

    <p v-if="error" class="banner">{{ error }}</p>

    <template v-if="state">
      <PlayerBoard
        :state="state"
        :events="events"
        :selected-id="selectedId"
        @pick="selectPlayer"
        @rename="openRename"
      />

      <p class="hint">{{ hintText }}</p>

      <div v-if="state.status === 'live'" class="dock">
        <ActionPad
          :enabled="!!selectedId"
          :can-undo="events.length > 0"
          :points="state.config.points"
          :both-pay="state.playerCount === 3"
          :eight="isEight"
          @win="onWin"
          @foul="onFoul"
          @undo="run({ kind: 'undo' })"
        />
      </div>
      <div v-else class="card ended">{{ endedText }}</div>

      <div class="grid-2 tools">
        <router-link class="btn btn-ghost" :to="`/m/${code}/stats`">本场统计</router-link>
        <button
          class="btn"
          :class="state.status === 'live' ? 'btn-danger' : 'btn-ok'"
          @click="toggleEnd"
        >
          {{ state.status === 'live' ? '结束比赛' : '恢复比赛' }}
        </button>
      </div>

      <details class="log-box">
        <summary>本场记录</summary>
        <div class="card log">
          <p v-if="visibleEvents.length === 0" class="empty">还没有记分</p>
          <div v-for="e in visibleEvents" :key="e.id" class="log-row">
            <span>{{ e.summary }}</span>
            <small>{{ time(e.at) }}</small>
          </div>
        </div>
      </details>
    </template>

    <Sheet :open="!!pendingWin" @close="pendingWin = null">
      <h3>确认 {{ pendingWin ? WIN_LABELS[pendingWin] : '' }}</h3>
      <p v-if="pendingPreview" class="confirm-copy">
        {{ pendingPreview.winnerName }} {{ WIN_LABELS[pendingPreview.winType] }}，{{ formatSettlement(pendingPreview) }}
      </p>
      <div class="grid-2">
        <button class="btn btn-ghost" @click="pendingWin = null">取消</button>
        <button class="btn btn-gold" @click="confirmWin">确认</button>
      </div>
    </Sheet>

    <Sheet :open="!!renameId" @close="renameId = ''">
      <h3>修改姓名</h3>
      <div class="field">
        <input v-model="renameValue" maxlength="12" />
      </div>
      <div class="grid-2">
        <button class="btn btn-ghost" @click="renameId = ''">取消</button>
        <button class="btn btn-gold" @click="saveRename">保存</button>
      </div>
    </Sheet>

    <Sheet :open="shareOpen" @close="shareOpen = false">
      <h3>分享本场</h3>
      <p class="confirm-copy">把短码发给别人，用另一部手机打开就能一起记分。</p>
      <div class="share-code">{{ code }}</div>
      <button class="btn btn-gold btn-block" @click="copyLink">复制链接</button>
    </Sheet>

    <p v-if="notice" class="toast">{{ notice }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  currentShooter,
  hydrateState,
  formatSettlement,
  isEightMode,
  previewWin,
  WIN_LABELS,
  type Action,
  type FoulType,
  type WinType,
} from '@engine'
import ActionPad from '../components/ActionPad.vue'
import PlayerBoard from '../components/PlayerBoard.vue'
import Sheet from '../components/Sheet.vue'
import { ApiError, NetworkError, postAction } from '../api.ts'
import { useMatchSync } from '../composables/useMatchSync.ts'
import { useWakeLock } from '../composables/useWakeLock.ts'

const route = useRoute()
const code = computed(() => String(route.params.code).toUpperCase())
const { state, events, connected, error, reload, applyRecord } = useMatchSync(code)
useWakeLock()

const selectedId = ref('')
const pendingWin = ref<WinType | null>(null)
const renameId = ref('')
const renameValue = ref('')
const shareOpen = ref(false)
const notice = ref('')
const busy = ref(false)
let busyToken = 0

watch(
  () => state.value?.id,
  (id, prev) => {
    if (id !== prev) selectedId.value = ''
  },
)

const visibleEvents = computed(() => [...events.value].reverse().slice(0, 20))
const isEight = computed(() => !!state.value && isEightMode(state.value))
const endedText = computed(() => {
  if (!state.value) return '本场已结束'
  if (!isEight.value) return '本场已结束'
  const [a, b] = state.value.players
  if (!a || !b) return '本场已结束'
  const leader = a.score >= b.score ? a : b
  const other = leader.id === a.id ? b : a
  if (leader.score >= (state.value.raceTo ?? 7) && leader.score !== other.score) {
    return `${leader.name} ${leader.score}-${other.score} 获胜`
  }
  return '本场已结束'
})

const hintText = computed(() => {
  if (!state.value) return ''
  if (state.value.status === 'ended') return endedText.value
  if (!selectedId.value) {
    return isEight.value ? '先点玩家，再记普胜 / 接清 / 炸清' : '先点玩家，再记普胜 / 金 / 犯规 / 让杆'
  }
  const name = state.value.players.find((p) => p.id === selectedId.value)?.name ?? ''
  try {
    const p = previewWin(state.value, 'normal', selectedId.value)
    return `${name} 普胜将${formatSettlement(p)}`
  } catch {
    return `已选 ${name}`
  }
})

const pendingPreview = computed(() => {
  if (!state.value || !pendingWin.value || !selectedId.value) return null
  try {
    return previewWin(state.value, pendingWin.value, selectedId.value)
  } catch {
    return null
  }
})

function selectPlayer(id: string) {
  selectedId.value = id
}

function vibrate() {
  navigator.vibrate?.(12)
}

async function run(action: Action) {
  if (!state.value || busy.value) return
  const token = ++busyToken
  busy.value = true
  const watch = window.setTimeout(() => {
    if (busyToken === token) busy.value = false
  }, 10_000)
  try {
    const record = await postAction(code.value, action, state.value.seq)
    applyRecord(record)
    error.value = ''
    const live = state.value ?? record.state
    selectedId.value = currentShooter(hydrateState(live)).id
    vibrate()
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.message
      applyRecord(err)
    } else if (err instanceof NetworkError) {
      error.value = err.message
    } else {
      error.value = err instanceof Error ? err.message : '操作失败'
    }
    await reload().catch(() => undefined)
  } finally {
    window.clearTimeout(watch)
    if (busyToken === token) busy.value = false
    pendingWin.value = null
  }
}

function onWin(type: WinType) {
  if (!selectedId.value) return
  if (type === 'normal' && !state.value?.concessionActive) {
    void run({ kind: 'win', winType: type, playerId: selectedId.value })
    return
  }
  pendingWin.value = type
}

function confirmWin() {
  if (!pendingWin.value || !selectedId.value) return
  void run({ kind: 'win', winType: pendingWin.value, playerId: selectedId.value })
}

function onFoul(type: FoulType) {
  if (!selectedId.value) return
  void run({ kind: 'foul', foulType: type, playerId: selectedId.value })
}

function openRename(playerId: string) {
  const player = state.value?.players.find((p) => p.id === playerId)
  renameId.value = playerId
  renameValue.value = player?.name ?? ''
}

function saveRename() {
  if (!renameId.value) return
  void run({ kind: 'rename', playerId: renameId.value, name: renameValue.value })
  renameId.value = ''
}

function toggleEnd() {
  if (state.value?.status === 'live') void run({ kind: 'endMatch' })
  else void run({ kind: 'reopenMatch' })
}

const shareUrl = computed(() => `${location.origin}/m/${code.value}`)

function showNotice(text: string) {
  notice.value = text
  window.setTimeout(() => {
    if (notice.value === text) notice.value = ''
  }, 1800)
}

async function copyLink() {
  const url = shareUrl.value
  let copied = false
  try {
    await navigator.clipboard.writeText(url)
    copied = true
  } catch {
    const input = document.createElement('textarea')
    input.value = url
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.select()
    copied = document.execCommand('copy')
    input.remove()
  }
  if (!copied) {
    showNotice('复制失败，请记下短码 ' + code.value)
    return
  }
  shareOpen.value = false
  showNotice('链接已复制，发给别人就能一起记分')
}

function time(at: number) {
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.match-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding-bottom: calc(8px + var(--safe-bottom));
}
.center {
  text-align: center;
}
.code {
  letter-spacing: 0.22em;
  font-weight: 800;
  color: var(--gold);
}
.hint {
  margin: 10px 4px 12px;
  color: var(--gold-2);
  font-size: 13px;
  text-align: center;
  min-height: 1.4em;
}
.dock {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin: 8px -16px 0;
  padding: 10px 16px 0;
  background: transparent;
}
.tools {
  margin: 8px 0;
}
.ended {
  padding: 16px;
  text-align: center;
  margin-bottom: 12px;
}
.log-box {
  color: var(--muted);
  font-size: 13px;
}
.log-box summary {
  cursor: pointer;
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}
.log {
  padding: 6px 0;
}
.log-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink);
}
.log-row:last-child { border-bottom: 0; }
.log-row small {
  color: var(--muted);
  flex-shrink: 0;
}
h3 { margin: 4px 0 12px; }
.confirm-copy {
  color: var(--muted);
  margin: 0 0 16px;
  line-height: 1.5;
}
.share-code {
  text-align: center;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: var(--gold);
  margin: 4px 0 16px;
  user-select: all;
  -webkit-user-select: all;
}
</style>
