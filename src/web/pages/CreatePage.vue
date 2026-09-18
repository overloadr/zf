<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.back()">返回</button>
      <h1>开新局</h1>
      <span style="width: 64px"></span>
    </header>

    <div class="segment">
      <button :class="{ active: count === 2 }" @click="count = 2">2 人追分</button>
      <button :class="{ active: count === 3 }" @click="count = 3">3 人追分</button>
    </div>

    <div class="field" v-for="(name, i) in names" :key="i">
      <label>{{ seatHint(i) }}</label>
      <input v-model="names[i]" :placeholder="seatHint(i)" />
    </div>

    <div class="card legend">
      <h2>固定分（1-4-7-10）</h2>
      <p>犯规 1 · 普胜 4 · 小金 7 · 黄金九 4 · 大金 10</p>
      <p class="muted">
        普胜/小金赢上家；大金、黄金九三人时两家各赔。让杆普胜、让杆小金由下家双倍赔。小局赢后赢家开大杆，上局输家变二杆。
      </p>
    </div>

    <button class="linkish" type="button" @click="advanced = !advanced">
      {{ advanced ? '收起分值' : '自定义分值' }}
    </button>
    <div v-if="advanced" class="card extras">
      <div class="field" v-for="row in pointFields" :key="row.key">
        <label>{{ row.label }}</label>
        <input v-model.number="points[row.key]" type="number" min="0" step="1" />
      </div>
    </div>

    <p v-if="error" class="banner">{{ error }}</p>
    <button class="btn btn-gold btn-block" :disabled="busy" @click="submit">开始记分</button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DEFAULT_POINTS } from '@engine'
import { createMatch } from '../api.ts'

const router = useRouter()
const count = ref<2 | 3>(3)
const names = ref(['', '', ''])
const advanced = ref(false)
const busy = ref(false)
const error = ref('')
const points = reactive({ ...DEFAULT_POINTS })

const pointFields = [
  { key: 'foul', label: '犯规' },
  { key: 'normal', label: '普胜' },
  { key: 'smallGold', label: '小金' },
  { key: 'goldenNine', label: '黄金九' },
  { key: 'bigGold', label: '大金' },
] as const

watch(count, (n) => {
  if (n === 2) names.value = [names.value[0] || '', names.value[1] || '']
  if (n === 3 && names.value.length < 3) names.value = [...names.value.slice(0, 2), names.value[2] || '']
})

const filled = computed(() => names.value.slice(0, count.value).map((n, i) => n.trim() || `玩家${i + 1}`))

function seatHint(i: number) {
  if (count.value === 2) return i === 0 ? '上 · 大杆' : '下 · 二杆'
  return ['上 · 大杆', '中 · 二杆', '下 · 三杆'][i] ?? `玩家${i + 1}`
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const { state } = await createMatch({
      names: filled.value,
      points: { ...points },
    })
    router.replace(`/m/${state.code}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.linkish {
  background: none;
  color: var(--gold);
  padding: 0 0 14px;
  min-height: auto;
}
.legend {
  padding: 14px 16px;
  margin-bottom: 12px;
}
.legend h2 {
  margin: 0 0 8px;
  font-size: 14px;
  letter-spacing: 0.08em;
}
.legend p {
  margin: 0 0 6px;
  font-size: 14px;
}
.extras {
  padding: 14px 14px 2px;
  margin-bottom: 16px;
}
</style>
