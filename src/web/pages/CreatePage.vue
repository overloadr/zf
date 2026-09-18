<template>
  <div class="page">
    <header class="topbar">
      <button class="btn btn-ghost" @click="$router.back()">返回</button>
      <h1>开新局</h1>
      <span></span>
    </header>

    <div class="segment triple">
      <button :class="{ active: kind === 'chase2' }" @click="kind = 'chase2'">2 人追分</button>
      <button :class="{ active: kind === 'chase3' }" @click="kind = 'chase3'">3 人追分</button>
      <button :class="{ active: kind === 'eight' }" @click="kind = 'eight'">中八</button>
    </div>

    <div class="field" v-for="(name, i) in names" :key="i">
      <label>{{ seatHint(i) }}</label>
      <input v-model="names[i]" :placeholder="seatHint(i)" />
    </div>

    <div v-if="kind === 'chase3'" class="field">
      <label>大金 / 黄金九通吃后，二杆与三杆</label>
      <div class="segment triple">
        <button :class="{ active: sweepOrder === 'keep' }" @click="sweepOrder = 'keep'">保持不变</button>
        <button :class="{ active: sweepOrder === 'rotate' }" @click="sweepOrder = 'rotate'">轮换</button>
        <button :class="{ active: sweepOrder === 'random' }" @click="sweepOrder = 'random'">随机</button>
      </div>
      <p class="muted sweep-hint">
        赢家继续开大杆。二杆、三杆可保持不变（默认）、对换轮换，或每局随机。
      </p>
    </div>

    <template v-if="kind === 'eight'">
      <div class="card legend">
        <h2>抢 {{ raceTo }} 局</h2>
        <p>普胜 · 接清 · 炸清 各计 1 局，先到 {{ raceTo }} 局获胜。胜者开下一局。</p>
      </div>
      <div class="field">
        <label>抢多少局</label>
        <div class="segment race">
          <button
            v-for="n in racePresets"
            :key="n"
            :class="{ active: raceTo === n }"
            @click="raceTo = n"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <div class="field">
        <label>自定义局数</label>
        <input v-model.number="raceTo" type="number" min="1" max="99" step="1" />
      </div>
    </template>

    <template v-else>
      <div class="card legend">
        <h2>固定分（1-4-7-10）</h2>
        <p>犯规 1 · 普胜 4 · 小金 7 · 黄金九 4 · 大金 10</p>
        <p class="muted">
          普胜/小金赢上家；大金、黄金九三人时两家各赔。让杆普胜、让杆小金由下家双倍赔。普通犯规赔上家 1 分，让杆犯规赔下家 1 分。小局赢后赢家开大杆，上局输家变二杆。
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
    </template>

    <p v-if="error" class="banner">{{ error }}</p>
    <button class="btn btn-gold btn-block" :disabled="busy" @click="submit">开始记分</button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DEFAULT_POINTS, RACE_PRESETS, type SweepOrder } from '@engine'
import { createMatch } from '../api.ts'

type Kind = 'chase2' | 'chase3' | 'eight'

const router = useRouter()
const kind = ref<Kind>('chase3')
const names = ref(['', '', ''])
const advanced = ref(false)
const busy = ref(false)
const error = ref('')
const points = reactive({ ...DEFAULT_POINTS })
const raceTo = ref(7)
const racePresets = RACE_PRESETS
const sweepOrder = ref<SweepOrder>('keep')

const pointFields = [
  { key: 'foul', label: '犯规' },
  { key: 'normal', label: '普胜' },
  { key: 'smallGold', label: '小金' },
  { key: 'goldenNine', label: '黄金九' },
  { key: 'bigGold', label: '大金' },
] as const

const count = computed(() => (kind.value === 'chase3' ? 3 : 2))

watch(kind, () => {
  if (count.value === 2) names.value = [names.value[0] || '', names.value[1] || '']
  if (count.value === 3 && names.value.length < 3) {
    names.value = [...names.value.slice(0, 2), names.value[2] || '']
  }
})

const filled = computed(() => names.value.slice(0, count.value).map((n, i) => n.trim() || `玩家${i + 1}`))

function seatHint(i: number) {
  if (kind.value === 'eight') return i === 0 ? '开球 · 大杆' : '二杆'
  if (count.value === 2) return i === 0 ? '上 · 大杆' : '下 · 二杆'
  return ['上 · 大杆', '中 · 二杆', '下 · 三杆'][i] ?? `玩家${i + 1}`
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const eight = kind.value === 'eight'
    const { state } = await createMatch({
      names: filled.value,
      points: eight ? undefined : { ...points },
      mode: eight ? 'eight' : 'chase',
      raceTo: eight ? Number(raceTo.value) : undefined,
      sweepOrder: kind.value === 'chase3' ? sweepOrder.value : undefined,
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
.topbar {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;
}
.topbar h1 {
  text-align: center;
}
.topbar > :first-child {
  justify-self: start;
}
.topbar > :last-child {
  justify-self: end;
  width: auto;
}
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
.segment.triple {
  grid-template-columns: 1fr 1fr 1fr;
}
.segment.triple button {
  min-width: 0;
  padding: 0 4px;
  font-size: 14px;
  letter-spacing: 0;
  white-space: nowrap;
}
.segment.race {
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 0;
}
.segment.race button {
  font-variant-numeric: tabular-nums;
}
.sweep-hint {
  margin: 8px 0 0;
}
</style>
