import { onMounted, onUnmounted } from 'vue'

export type ResumeReason = 'visible' | 'pageshow' | 'online' | 'focus' | 'resume' | 'gesture'
export type SleepReason = 'hidden' | 'pagehide' | 'freeze' | 'offline'

const RESUME_DEBOUNCE_MS = 80
const STALE_AFTER_MS = 2000

export function usePageResume(
  onResume: (info: { reason: ResumeReason; hiddenFor: number; stale: boolean }) => void,
  onSleep?: (reason: SleepReason) => void,
) {
  let hiddenAt = 0
  let debounce: number | undefined
  let lastResumeAt = 0

  function markHidden() {
    if (!hiddenAt) hiddenAt = Date.now()
  }

  function fireResume(reason: ResumeReason) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      if (reason !== 'online') return
    }
    if (debounce) window.clearTimeout(debounce)
    const delay = reason === 'gesture' ? 0 : RESUME_DEBOUNCE_MS
    debounce = window.setTimeout(() => {
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      const stale = hiddenFor >= STALE_AFTER_MS || Date.now() - lastResumeAt > 30_000
      lastResumeAt = Date.now()
      onResume({ reason, hiddenFor, stale })
    }, RESUME_DEBOUNCE_MS)
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      markHidden()
      onSleep?.('hidden')
      return
    }
    fireResume('visible')
  }

  function onPageShow() {
    fireResume('pageshow')
  }

  function onPageHide() {
    markHidden()
    onSleep?.('pagehide')
  }

  function onFreeze() {
    markHidden()
    onSleep?.('freeze')
  }

  function onLifecycleResume() {
    fireResume('resume')
  }

  function onOnline() {
    fireResume('online')
  }

  function onOffline() {
    onSleep?.('offline')
  }

  function onFocus() {
    if (document.visibilityState === 'visible') fireResume('focus')
  }

  function onGesture() {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastResumeAt < 8000) return
    fireResume('gesture')
  }

  onMounted(() => {
    lastResumeAt = Date.now()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('freeze', onFreeze)
    document.addEventListener('resume', onLifecycleResume)
    document.addEventListener('pointerdown', onGesture, { passive: true })
  })

  onUnmounted(() => {
    if (debounce) window.clearTimeout(debounce)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('freeze', onFreeze)
    document.removeEventListener('resume', onLifecycleResume)
    document.removeEventListener('pointerdown', onGesture)
  })
}
