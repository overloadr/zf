<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.push(`/m/${code}`)">返回</button>
      <h1>本场统计</h1>
      <span style="width: 64px"></span>
    </header>
    <p v-if="error" class="banner">{{ error }}</p>
    <section v-if="locked" class="card gate">
      <h3>本场设有房间密码</h3>
      <div class="field">
        <input
          v-model="gatePassword"
          type="password"
          maxlength="32"
          placeholder="房间密码"
          @keyup.enter="unlockRoom"
        />
      </div>
      <button class="btn btn-gold btn-block" @click="unlockRoom">查看统计</button>
    </section>
    <p v-if="stats" class="sub" style="margin-bottom: 14px">
      {{ stats.code }} · {{ kindLine }} · 共 {{ stats.racks }} 局
    </p>
    <article v-for="p in stats?.players ?? []" :key="p.playerId" class="card stat-card">
      <div class="head">
        <strong>{{ p.name }}</strong>
        <span class="score" :class="scoreClass(p.score)">
          {{ displayScore(p.score) }}
        </span>
      </div>
      <p class="muted">
        {{ eight ? `胜 ${p.score} 局` : `击球 ${p.racksPlayed} 局 · 最大单杆 ${p.biggestWin}` }}
      </p>
      <p class="muted">
        当前连胜 {{ p.currentWinStreak }} · 最长连胜 {{ p.maxWinStreak }} ·
        当前连败 {{ p.currentLoseStreak }} · 最长连败 {{ p.maxLoseStreak }}
      </p>
      <div class="chips">
        <template v-if="eight">
          <span>普胜 {{ p.wins.normal }}</span>
          <span>接清 {{ p.wins.clear }}</span>
          <span>炸清 {{ p.wins.breakClear }}</span>
        </template>
        <template v-else>
          <span>普胜 {{ p.wins.normal }}</span>
          <span>小金 {{ p.wins.smallGold }}</span>
          <span>大金 {{ p.wins.bigGold }}</span>
          <span>黄金九 {{ p.wins.goldenNine }}</span>
          <span>让杆普胜 {{ p.wins.concession }}</span>
          <span>让杆小金 {{ p.wins.concessionSmallGold }}</span>
          <span>普通犯规 {{ p.fouls.normal }}</span>
          <span>让杆犯规 {{ p.fouls.concession }}</span>
          <span>让杆 {{ p.concessionsGiven }}</span>
        </template>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { formatAmount, type MatchStats } from '@engine'
import { ApiError, getMatchStats } from '../api.ts'
import { setRoomPassword } from '../roomAccess.ts'

const route = useRoute()
const code = computed(() => String(route.params.code).toUpperCase())
const stats = ref<MatchStats | null>(null)
const error = ref('')
const locked = ref(false)
const gatePassword = ref('')

async function load() {
  try {
    stats.value = await getMatchStats(code.value)
    locked.value = false
    error.value = ''
  } catch (err) {
    if (err instanceof ApiError && err.needPassword) {
      locked.value = true
      error.value = err.message
      return
    }
    error.value = err instanceof Error ? err.message : '加载失败'
  }
}

async function unlockRoom() {
  const value = gatePassword.value.trim()
  if (!value) {
    error.value = '请输入房间密码'
    return
  }
  setRoomPassword(code.value, value)
  await load()
}

onMounted(() => {
  void load()
})

const eight = computed(() => stats.value?.mode === 'eight')
const kindLine = computed(() => {
  if (!stats.value) return ''
  return stats.value.mode === 'eight' ? `中八 抢${stats.value.raceTo ?? 7}` : '追分'
})

function displayScore(n: number) {
  if (eight.value) return formatAmount(n)
  const s = formatAmount(n)
  return n > 0 ? `+${s}` : s
}

function scoreClass(n: number) {
  if (eight.value) return n > 0 ? 'pos' : ''
  return { pos: n > 0, neg: n < 0 }
}
</script>

<style scoped>
.stat-card {
  padding: 14px 16px 16px;
  margin-bottom: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
}
.score { font-size: 22px; }
.score.pos { color: var(--ok); }
.score.neg { color: var(--danger); }
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.chips span {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--muted);
}
.gate {
  padding: 16px;
  margin-bottom: 12px;
}
</style>
