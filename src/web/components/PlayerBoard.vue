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
        hot: card.streak?.kind === 'hot',
        cold: card.streak?.kind === 'cold',
        [`streak-${card.streak?.level}`]: !!card.streak,
      }"
      @click="pick(card.player.id)"
    >
      <div
        v-if="card.streak && selectedId !== card.player.id"
        class="fx"
        :class="card.streak.kind"
        aria-hidden="true"
      >
        <i></i><i></i><i></i><i></i>
      </div>
      <div class="who">{{ card.player.name }}</div>
      <div class="info">
        <div class="status">
          <span class="tag" :class="card.tag">{{ card.cue }}</span>
          <span v-if="card.shooting" class="live">击球</span>
          <span v-if="selectedId === card.player.id" class="picked">已选</span>
          <span v-if="card.streak" class="streak" :class="card.streak.kind">
            {{ card.streak.label }}
          </span>
        </div>
        <div class="stats">
          <span>普胜 {{ card.stats.wins.normal }}</span>
          <span>小金 {{ card.stats.wins.smallGold }}</span>
          <span>大金 {{ card.stats.wins.bigGold }}</span>
          <span>金九 {{ card.stats.wins.goldenNine }}</span>
          <span>让杆普胜 {{ card.stats.wins.concession }}</span>
          <span>让杆小金 {{ card.stats.wins.concessionSmallGold }}</span>
          <span>犯规 {{ card.stats.fouls.normal }}</span>
          <span>让犯 {{ card.stats.fouls.concession }}</span>
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
  type PlayerStats,
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
    const stats = statsById.value.get(player.id) ?? emptyPlayerStats(player.id, player.name, player.score)
    return {
      player,
      tag,
      cue: CUE_LABELS[tag],
      shooting: player.id === shooter.id,
      stats,
      streak: streakOf(stats),
    }
  })
})

function streakLevel(n: number) {
  if (n >= 5) return 5
  if (n >= 3) return 3
  if (n >= 2) return 2
  return 0
}

function streakOf(stats: PlayerStats) {
  if (stats.currentWinStreak >= 2) {
    return {
      kind: 'hot' as const,
      level: streakLevel(stats.currentWinStreak),
      label: `连胜 ${stats.currentWinStreak}`,
    }
  }
  if (stats.currentLoseStreak >= 2) {
    return {
      kind: 'cold' as const,
      level: streakLevel(stats.currentLoseStreak),
      label: `连败 ${stats.currentLoseStreak}`,
    }
  }
  return null
}

function signed(n: number) {
  const s = formatAmount(n)
  return n > 0 ? `+${s}` : s
}
</script>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 2;
  padding: 4px 2px;
}
.person {
  display: grid;
  grid-template-columns: 4.2em minmax(0, 1fr) 4.8em;
  align-items: stretch;
  gap: 8px 10px;
  width: 100%;
  height: 108px;
  padding: 10px 12px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.28);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
}
.person.shooting {
  border-color: rgba(230, 195, 106, 0.28);
}
.person.hot:not(.selected) {
  background: linear-gradient(180deg, rgba(255, 110, 28, 0.16), rgba(12, 32, 22, 0.62));
}
.person.cold:not(.selected) {
  background: linear-gradient(180deg, rgba(64, 108, 152, 0.16), rgba(8, 16, 22, 0.74));
}
.person.hot:not(.selected)::before,
.person.cold:not(.selected)::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}
.person.hot:not(.selected)::before {
  box-shadow: inset 0 0 22px rgba(255, 120, 24, 0.22);
  animation: hotIn 1.6s ease-in-out infinite;
}
.person.hot.streak-5:not(.selected)::before {
  box-shadow: inset 0 0 30px rgba(255, 90, 8, 0.32);
}
.person.cold:not(.selected)::before {
  box-shadow: inset 0 0 20px rgba(80, 140, 200, 0.2);
  animation: coldIn 2.2s ease-in-out infinite;
}
.person.selected {
  z-index: 3;
  border-color: var(--gold);
  background: linear-gradient(180deg, rgba(230, 195, 106, 0.38), rgba(12, 32, 22, 0.72));
  box-shadow:
    0 0 0 3px var(--gold),
    0 0 0 7px rgba(230, 195, 106, 0.28),
    0 10px 28px rgba(0, 0, 0, 0.35);
}
.who,
.info,
.score-col {
  position: relative;
  z-index: 1;
}
.who {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  align-self: start;
  padding-top: 2px;
  font-size: 22px;
  font-weight: 800;
  color: var(--gold);
  text-align: center;
  line-height: 1.15;
  word-break: break-all;
}
.info {
  display: grid;
  grid-template-rows: 22px minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
  min-height: 0;
  pointer-events: none;
}
.status {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  white-space: nowrap;
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
  flex-shrink: 0;
  font-size: 11px;
  color: var(--gold-2);
  white-space: nowrap;
}
.picked {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  color: #1b1404;
  background: var(--gold);
  border-radius: 999px;
  padding: 2px 8px;
  box-shadow: 0 0 10px rgba(230, 195, 106, 0.55);
}
.stats {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.25fr) minmax(0, 1.2fr);
  grid-template-rows: repeat(3, 1fr);
  align-content: center;
  gap: 2px 6px;
  margin: 0;
  min-height: 0;
}
.stats span {
  font-size: 11px;
  color: var(--muted);
  background: none;
  border-radius: 0;
  padding: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.score-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0;
  min-width: 0;
}
.score {
  font-size: 30px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  min-width: 2.2em;
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
.streak {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.streak.hot {
  color: #1b1404;
  background: linear-gradient(180deg, #ffe08a, #ff9a3c);
  box-shadow: 0 0 10px rgba(255, 150, 50, 0.45);
  animation: badgeGlow 1.2s ease-in-out infinite;
}
.streak.cold {
  color: #d7eaff;
  background: linear-gradient(180deg, rgba(96, 148, 198, 0.7), rgba(40, 72, 112, 0.82));
}
.person.selected .streak {
  animation: none;
  box-shadow: none;
  filter: none;
  opacity: 0.88;
}
.fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
}
.fx i {
  position: absolute;
  display: block;
  opacity: 0;
}
.fx.hot i {
  bottom: -8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe08a 0%, #ff7a2a 62%, transparent 72%);
  animation: spark 1.8s ease-out infinite;
}
.fx.hot i:nth-child(1) { left: 16%; animation-delay: 0s; }
.fx.hot i:nth-child(2) { left: 38%; width: 5px; height: 5px; animation-delay: 0.35s; }
.fx.hot i:nth-child(3) { left: 61%; animation-delay: 0.7s; }
.fx.hot i:nth-child(4) { left: 82%; width: 4px; height: 4px; animation-delay: 1.05s; }
.fx.cold i {
  top: -8px;
  width: 4px;
  height: 9px;
  border-radius: 40%;
  background: linear-gradient(180deg, rgba(220, 240, 255, 0.95), rgba(140, 190, 230, 0.08));
  animation: flake 2.4s linear infinite;
}
.fx.cold i:nth-child(1) { left: 18%; animation-delay: 0s; }
.fx.cold i:nth-child(2) { left: 40%; animation-delay: 0.5s; height: 7px; }
.fx.cold i:nth-child(3) { left: 63%; animation-delay: 1s; }
.fx.cold i:nth-child(4) { left: 84%; animation-delay: 1.5s; height: 6px; }
@keyframes hotIn {
  0%, 100% { box-shadow: inset 0 0 16px rgba(255, 120, 24, 0.18); }
  50% { box-shadow: inset 0 0 36px rgba(255, 80, 8, 0.42); }
}
@keyframes coldIn {
  0%, 100% { box-shadow: inset 0 0 16px rgba(80, 140, 200, 0.16); }
  50% { box-shadow: inset 0 0 30px rgba(120, 180, 230, 0.32); }
}
@keyframes badgeGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.16); }
}
@keyframes spark {
  0% { transform: translateY(0) scale(0.55); opacity: 0; }
  18% { opacity: 1; }
  100% { transform: translateY(-92px) scale(1.12); opacity: 0; }
}
@keyframes flake {
  0% { transform: translateY(0) rotate(0deg); opacity: 0; }
  12% { opacity: 0.85; }
  100% { transform: translateY(100px) rotate(48deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .person.hot:not(.selected)::before,
  .person.cold:not(.selected)::before,
  .streak.hot,
  .fx i {
    animation: none;
  }
  .fx i { opacity: 0; }
}
</style>
