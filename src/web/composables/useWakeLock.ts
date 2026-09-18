import { onMounted, onUnmounted } from 'vue'

export function useWakeLock() {
  let lock: WakeLockSentinel | null = null

  async function request() {
    try {
      lock = await navigator.wakeLock?.request('screen')
    } catch {
      /* browsers may deny */
    }
  }

  onMounted(() => {
    void request()
    document.addEventListener('visibilitychange', onVis)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVis)
    void lock?.release()
  })

  function onVis() {
    if (document.visibilityState === 'visible') void request()
  }
}
