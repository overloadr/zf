<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.push('/')">大厅</button>
      <h1>历史场次</h1>
      <span></span>
    </header>

    <div class="card filters">
      <div class="dates">
        <div class="field">
          <label for="history-from">开始日期</label>
          <div class="date-box">
            <input id="history-from" v-model="fromDate" type="date" />
          </div>
        </div>
        <div class="field">
          <label for="history-to">结束日期</label>
          <div class="date-box">
            <input id="history-to" v-model="toDate" type="date" />
          </div>
        </div>
      </div>
      <div class="grid-2">
        <button class="btn btn-ghost" type="button" @click="resetRange">重置</button>
        <button class="btn btn-gold" type="button" :disabled="loading" @click="reload">查询</button>
      </div>
    </div>

    <p v-if="error" class="banner">{{ error }}</p>
    <p class="muted count">{{ loading ? '加载中…' : `共 ${matches.length} 场` }}</p>

    <div v-if="!loading && matches.length === 0" class="card empty">
      {{ hasRange ? '这个日期范围内没有比赛' : '还没有结束的比赛' }}
    </div>
    <div v-else class="list">
      <div v-for="m in matches" :key="m.id" class="card match-row history-row">
        <router-link class="main" :to="`/m/${m.code}`">
          <div class="code">{{ m.code }}</div>
          <div class="names">{{ scoreLine(m) }}</div>
          <div class="muted">{{ matchKindLabel(m) }} · {{ when(m.updatedAt) }}</div>
        </router-link>
        <button class="btn btn-danger del" type="button" @click="openDelete(m)">删除</button>
      </div>
    </div>

    <Sheet :open="!!pending" @close="closeDelete">
      <h3>删除比赛</h3>
      <p class="confirm-copy">
        删除后不可恢复。确认删除
        <strong>{{ pending?.code }}</strong>
        ？
        <template v-if="needCreds">请输入管理员账号密码。</template>
        <template v-else>30 分钟内无需再次输入账号密码。</template>
      </p>
      <template v-if="needCreds">
        <div class="field">
          <label for="admin-user">管理员账号</label>
          <input id="admin-user" v-model="username" autocomplete="username" />
        </div>
        <div class="field">
          <label for="admin-pass">密码</label>
          <input id="admin-pass" v-model="password" type="password" autocomplete="current-password" />
        </div>
      </template>
      <p v-if="deleteError" class="banner">{{ deleteError }}</p>
      <div class="grid-2">
        <button class="btn btn-ghost" type="button" @click="closeDelete">取消</button>
        <button class="btn btn-danger" type="button" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? '删除中…' : '确认删除' }}
        </button>
      </div>
    </Sheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatAmount, matchKindLabel, type MatchState } from '@engine'
import { clearAdminSession, readAdminSession, saveAdminSession } from '../adminSession.ts'
import Sheet from '../components/Sheet.vue'
import { ApiError, deleteMatch, listMatches } from '../api.ts'

const matches = ref<MatchState[]>([])
const fromDate = ref('')
const toDate = ref('')
const loading = ref(false)
const error = ref('')
const pending = ref<MatchState | null>(null)
const username = ref('')
const password = ref('')
const needCreds = ref(true)
const deleting = ref(false)
const deleteError = ref('')

const hasRange = computed(() => Boolean(fromDate.value || toDate.value))

onMounted(() => {
  void reload()
})

async function reload() {
  error.value = ''
  loading.value = true
  try {
    const data = await listMatches('ended', rangeMs())
    matches.value = data.matches
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function rangeMs() {
  const start = fromDate.value
  const end = toDate.value
  if (start && end && start > end) {
    return {
      from: new Date(`${end}T00:00:00`).getTime(),
      to: new Date(`${start}T23:59:59.999`).getTime(),
    }
  }
  return {
    from: start ? new Date(`${start}T00:00:00`).getTime() : undefined,
    to: end ? new Date(`${end}T23:59:59.999`).getTime() : undefined,
  }
}

function resetRange() {
  fromDate.value = ''
  toDate.value = ''
  void reload()
}

function openDelete(match: MatchState) {
  pending.value = match
  deleteError.value = ''
  const session = readAdminSession()
  if (session) {
    username.value = session.username
    password.value = session.password
    needCreds.value = false
    return
  }
  needCreds.value = true
  username.value = ''
  password.value = ''
}

function closeDelete() {
  if (deleting.value) return
  pending.value = null
  deleteError.value = ''
}

async function confirmDelete() {
  if (!pending.value) return
  deleteError.value = ''
  deleting.value = true
  try {
    await deleteMatch(pending.value.code, username.value, password.value)
    saveAdminSession(username.value, password.value)
    const code = pending.value.code
    pending.value = null
    matches.value = matches.value.filter((m) => m.code !== code)
  } catch (err) {
    const message = err instanceof ApiError || err instanceof Error ? err.message : '删除失败'
    deleteError.value = message
    if (err instanceof ApiError && err.status === 401) {
      clearAdminSession()
      needCreds.value = true
      password.value = ''
    }
  } finally {
    deleting.value = false
  }
}

function scoreLine(m: MatchState) {
  return m.players
    .map((p) => `${p.name} ${m.mode === 'eight' ? formatAmount(p.score) : signed(p.score)}`)
    .join(' · ')
}

function signed(n: number) {
  const s = formatAmount(n)
  return n > 0 ? `+${s}` : s
}

function when(at: number) {
  return new Date(at).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.filters {
  padding: 14px 14px 4px;
  margin-bottom: 8px;
  overflow: hidden;
}
.dates {
  display: grid;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}
.dates .field {
  min-width: 0;
  max-width: 100%;
  margin-bottom: 10px;
}
.date-box {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--line);
}
.date-box input[type='date'] {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
  padding: 0 10px;
  font-size: 16px;
  -webkit-appearance: none;
  appearance: none;
}
.date-box input[type='date']::-webkit-date-and-time-value {
  text-align: left;
  min-width: 0;
}
.date-box input[type='date']::-webkit-datetime-edit,
.date-box input[type='date']::-webkit-datetime-edit-fields-wrapper {
  min-width: 0;
  padding: 0;
  overflow: hidden;
}
.date-box input[type='date']::-webkit-calendar-picker-indicator {
  margin: 0 0 0 6px;
  padding: 0;
  flex-shrink: 0;
}
.filters .grid-2 {
  margin-bottom: 10px;
}
.count {
  margin: 0 4px 12px;
}
.history-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 12px 16px;
}
.main {
  min-width: 0;
  color: inherit;
}
.del {
  min-height: 40px;
  padding: 0 12px;
  font-size: 13px;
}
h3 {
  margin: 4px 0 12px;
}
.confirm-copy {
  color: var(--muted);
  margin: 0 0 16px;
  line-height: 1.5;
}
.confirm-copy strong {
  color: var(--gold);
  letter-spacing: 0.12em;
}
</style>
