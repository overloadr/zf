<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <img class="brand-mark" src="/icon.svg" alt="" />
        <div>
          <h1>追分记分</h1>
          <p class="sub">双人 / 三人 / 中八 · 多端实时同步</p>
        </div>
      </div>
    </header>

    <form class="card join" @submit.prevent="join">
      <div class="field" style="margin: 0">
        <label>用短码进入比赛</label>
        <div class="join-row">
          <input v-model="code" maxlength="6" placeholder="例如 7K2Q" autocomplete="off" />
          <button class="btn btn-gold" type="submit">进入</button>
        </div>
      </div>
    </form>

    <router-link to="/new" class="btn btn-gold btn-block start">开新局</router-link>

    <div class="nav-links">
      <router-link to="/history">历史场次</router-link>
      <router-link to="/stats">技术统计</router-link>
    </div>

    <h2 class="sec">进行中</h2>
    <div v-if="live.length === 0" class="card empty">还没有进行中的比赛</div>
    <div v-else class="list">
      <router-link
        v-for="m in live"
        :key="m.id"
        class="card match-row"
        :to="`/m/${m.code}`"
      >
        <div>
          <div class="code">{{ m.code }}</div>
          <div class="names">{{ m.players.map((p) => p.name).join(' · ') }}</div>
        </div>
        <div class="muted">{{ matchKindLabel(m) }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { matchKindLabel, type MatchState } from '@engine'
import { listMatches } from '../api.ts'

const router = useRouter()
const live = ref<MatchState[]>([])
const code = ref('')

onMounted(async () => {
  const data = await listMatches('live')
  live.value = data.matches
})

function join() {
  const v = code.value.trim().toUpperCase()
  if (!v) return
  router.push(`/m/${v}`)
}
</script>

<style scoped>
.join {
  padding: 14px;
  margin-bottom: 14px;
}
.join-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.start {
  min-height: 54px;
  font-size: 17px;
}
.nav-links {
  display: flex;
  justify-content: space-between;
  margin: 16px 2px 8px;
  font-size: 14px;
}
.sec {
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.12em;
  margin: 8px 0 10px;
}
</style>
