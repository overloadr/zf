<template>
  <section class="board">
    <button
      v-for="card in cards"
      :key="card.player.id"
      type="button"
      class="person"
      :class="{
        selected: selectedId === card.player.id,
        shooting: card.shooting,
      }"
      @click="pick(card.player.id)"
    >
      <div class="who">{{ card.player.name }}</div>
      <div class="info">
        <div class="name-row">
          <span class="tag" :class="card.tag">{{ card.cue }}</span>
          <span v-if="card.shooting" class="live">击球</span>
          <span v-if="selectedId === card.player.id" class="picked">已选</span>
        </div>
        <div class="stats">
          <span>普胜 {{ card.stats.wins.normal }}</span>
          <span>小金 {{ card.stats.wins.smallGold }}</span>
          <span>大金 {{ card.stats.wins.bigGold }}</span>
          <span>黄金九 {{ card.stats.wins.goldenNine }}</span>
          <span>让杆普胜 {{ card.stats.wins.concession }}</span>
          <span>让杆小金 {{ card.stats.wins.concessionSmallGold }}</span>
          <span>普通犯规 {{ card.stats.fouls.normal }}</span>
          <span>让杆犯规 {{ card.stats.fouls.concession }}</span>
          <span>让杆 {{ card.stats.concessionsGiven }}</span>
        </div>
      </div>
      <div class="score-col">
        <div class="score" :class="{ pos: card.player.score > 0, neg: card.player.score < 0 }">
          {{ signed(card.player.score) }}
        </div>
        <span class="rename" @click.stop="rename(card.player.id)">改名</span>
      </div>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  CUE_LABELS,
  computeMatchStats,
  cueTag,
  currentShooter,
  emptyPlayerStats,
  formatAmount,
  hydrateState,
  seatedPlayers,
  type MatchEvent,
  type MatchState,
} from '@engine'

const props = defineProps<{
  state: MatchState
  events: MatchEvent[]
  selectedId: string
}>()

const emit = defineEmits<{
  pick: [playerId: string]
  rename: [playerId: string]
}>()

function pick(playerId: string) {
  emit('pick', playerId)
}

function rename(playerId: string) {
  emit('rename', playerId)
}

const live = computed(() => hydrateState(props.state))

const statsById = computed(() => {
  const stats = computeMatchStats(live.value, props.events)
  return new Map(stats.players.map((p) => [p.playerId, p]))
})

const cards = computed(() => {
  const state = live.value
  const shooter = currentShooter(state)
  return seatedPlayers(state).map((player) => {
    const tag = cueTag(state, player.id)
    return {
      player,
      tag,
      cue: CUE_LABELS[tag],
      shooting: player.id === shooter.id,
      stats: statsById.value.get(player.id) ?? emptyPlayerStats(player.id, player.name, player.score),
    }
  })
})

function signed(n: number) {
  const s = formatAmount(n)
  return n > 0 ? `+${s}` : s
}
</script>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  z-index: 2;
}
.person {
  display: grid;
  grid-template-columns: minmax(3.2em, 4.8em) minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  width: 100%;
  min-height: 112px;
  padding: 14px 14px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.28);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.person.shooting {
  border-color: rgba(230, 195, 106, 0.28);
}
.person.selected {
  border-color: var(--gold);
  background: linear-gradient(180deg, rgba(230, 195, 106, 0.28), rgba(12, 32, 22, 0.62));
  box-shadow: 0 0 0 2px rgba(230, 195, 106, 0.45);
}
.who {
  font-size: 22px;
  font-weight: 800;
  color: var(--gold);
  text-align: center;
  line-height: 1.2;
  word-break: break-all;
  padding-top: 6px;
}
.info {
  min-width: 0;
  pointer-events: none;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.name {
  font-size: 18px;
  font-weight: 800;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
}
.tag.break {
  background: rgba(230, 195, 106, 0.22);
  color: var(--gold);
}
.tag.second {
  background: rgba(94, 224, 192, 0.14);
  color: var(--ok);
}
.live {
  font-size: 11px;
  color: var(--gold-2);
}
.picked {
  font-size: 11px;
  font-weight: 700;
  color: #1b1404;
  background: var(--gold);
  border-radius: 999px;
  padding: 2px 8px;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 8px;
}
.stats span {
  font-size: 11px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  padding: 2px 7px;
  font-variant-numeric: tabular-nums;
}
.score-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.score {
  font-size: 42px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  min-width: 1.4em;
  text-align: right;
  pointer-events: none;
}
.score.pos { color: var(--ok); }
.score.neg { color: var(--danger); }
.rename {
  font-size: 12px;
  color: var(--muted);
  padding: 6px 4px;
  pointer-events: auto;
}
</style>
