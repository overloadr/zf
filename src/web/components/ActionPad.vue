<template>
  <section class="pad" :class="{ locked: !enabled }">
    <p v-if="!enabled" class="need">先点上面的玩家，再记这一杆</p>
    <template v-if="eight">
      <div class="row">
        <button class="btn btn-gold wide" :disabled="!enabled" @click="emit('win', 'normal')">
          普胜
          <small>+1 局</small>
        </button>
      </div>
      <div class="row">
        <button class="btn goldish" :disabled="!enabled" @click="emit('win', 'clear')">
          接清
          <small>+1 局</small>
        </button>
        <button class="btn goldish" :disabled="!enabled" @click="emit('win', 'breakClear')">
          炸清
          <small>+1 局</small>
        </button>
      </div>
    </template>
    <template v-else>
      <div class="row">
        <button class="btn btn-gold wide" :disabled="!enabled" @click="emit('win', 'normal')">
          普胜
          <small>+{{ points.normal }}</small>
        </button>
      </div>
      <div class="row">
        <button class="btn goldish" :disabled="!enabled" @click="emit('win', 'smallGold')">
          小金
          <small>+{{ points.smallGold }}</small>
        </button>
        <button class="btn goldish" :disabled="!enabled" @click="emit('win', 'bigGold')">
          大金
          <small>+{{ points.bigGold }}{{ bothPay ? '×2家' : '' }}</small>
        </button>
      </div>
      <div class="row">
        <button class="btn goldish wide" :disabled="!enabled" @click="emit('win', 'goldenNine')">
          黄金九
          <small>+{{ points.goldenNine }}{{ bothPay ? '×2家' : '' }}</small>
        </button>
      </div>
      <div class="row">
        <button class="btn btn-ok" :disabled="!enabled" @click="emit('win', 'concession')">
          让杆普胜
          <small>+{{ points.normal * 2 }}</small>
        </button>
        <button class="btn btn-ok" :disabled="!enabled" @click="emit('win', 'concessionSmallGold')">
          让杆小金
          <small>+{{ points.smallGold * 2 }}</small>
        </button>
      </div>
      <div class="row">
        <button class="btn btn-danger" :disabled="!enabled" @click="emit('foul', 'normal')">
          普通犯规
          <small>赔上家 {{ points.foul }}</small>
        </button>
        <button class="btn btn-danger" :disabled="!enabled" @click="emit('foul', 'concession')">
          让杆犯规
          <small>赔下家 {{ points.foul }}</small>
        </button>
      </div>
    </template>
    <div class="row">
      <button class="btn btn-ghost span" :disabled="!canUndo" @click="emit('undo')">撤销</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { FoulType, PointTable, WinType } from '@engine'

defineProps<{
  enabled: boolean
  canUndo: boolean
  points: PointTable
  bothPay: boolean
  eight?: boolean
}>()

const emit = defineEmits<{
  win: [type: WinType]
  foul: [type: FoulType]
  undo: []
}>()
</script>

<style scoped>
.pad {
  display: grid;
  gap: 8px;
}
.need {
  margin: 0;
  text-align: center;
  color: var(--gold);
  font-size: 13px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.wide {
  grid-column: 1 / -1;
  min-height: 52px;
  font-size: 18px;
}
.span {
  grid-column: 1 / -1;
}
.goldish,
.btn-ok,
.btn-danger,
.wide {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.15;
}
.goldish {
  min-height: 48px;
  background: rgba(230, 195, 106, 0.12);
  color: var(--gold-2);
  border: 1px solid rgba(230, 195, 106, 0.28);
  border-radius: 16px;
  font-weight: 700;
}
.btn small {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
  letter-spacing: 0;
}
.btn:disabled {
  opacity: 0.35;
}
</style>
