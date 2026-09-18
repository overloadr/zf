<template>
  <div v-if="open" class="mask" @click="emit('close')">
    <div class="sheet" @click.stop>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 16px;
}
.sheet {
  width: 100%;
  max-width: 400px;
  max-height: min(78dvh, 560px);
  overflow: auto;
  background: #102318;
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 18px 16px 16px;
}
</style>
