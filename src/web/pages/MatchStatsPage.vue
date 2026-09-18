<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.push(`/m/${code}`)">返回</button>
      <h1>本场统计</h1>
      <span style="width: 64px"></span>
    </header>
    <p v-if="stats" class="sub" style="margin-bottom: 14px">
      {{ stats.code }} · 共 {{ stats.racks }} 局
    </p>
    <article v-for="p in stats?.players ?? []" :key="p.playerId" class="card stat-card">
      <div class="head">
        <strong>{{ p.name }}</strong>
        <span class="score" :class="{ pos: p.score > 0, neg: p.score < 0 }">
          {{ signed(p.score) }}
        </span>
      </div>
      <p class="muted">击球 {{ p.racksPlayed }} 局 · 最大单杆 {{ p.biggestWin }}</p>
      <div class="chips">
        <span>普胜 {{ p.wins.normal }}</span>
        <span>小金 {{ p.wins.smallGold }}</span>
        <span>大金 {{ p.wins.bigGold }}</span>
        <span>黄金九 {{ p.wins.goldenNine }}</span>
        <span>让杆普胜 {{ p.wins.concession }}</span>
        <span>让杆小金 {{ p.wins.concessionSmallGold }}</span>
        <span>普通犯规 {{ p.fouls.normal }}</span>
        <span>让杆犯规 {{ p.fouls.concession }}</span>
        <span>让杆 {{ p.concessionsGiven }}</span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { formatAmount, type MatchStats } from '@engine'
import { getMatchStats } from '../api.ts'

const route = useRoute()
const code = computed(() => String(route.params.code).toUpperCase())
const stats = ref<MatchStats | null>(null)

onMounted(async () => {
  stats.value = await getMatchStats(code.value)
})

function signed(n: number) {
  const s = formatAmount(n)
  return n > 0 ? `+${s}` : s
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
</style>
