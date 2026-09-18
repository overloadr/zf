<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.push('/')">大厅</button>
      <h1>历史场次</h1>
      <span style="width: 64px"></span>
    </header>

    <div v-if="matches.length === 0" class="card empty">还没有结束的比赛</div>
    <div v-else class="list">
      <router-link
        v-for="m in matches"
        :key="m.id"
        class="card match-row"
        :to="`/m/${m.code}`"
      >
        <div>
          <div class="code">{{ m.code }}</div>
          <div class="names">{{ m.players.map((p) => `${p.name} ${signed(p.score)}`).join(' · ') }}</div>
          <div class="muted">{{ when(m.updatedAt) }}</div>
        </div>
        <div class="muted">查看</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { formatAmount, type MatchState } from '@engine'
import { listMatches } from '../api.ts'

const matches = ref<MatchState[]>([])

onMounted(async () => {
  const data = await listMatches('ended')
  matches.value = data.matches
})

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
