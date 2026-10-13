import { useSyncExternalStore } from 'react'

/**
 * Instalación como app y trabajo sin conexión.
 *
 * El service worker solo se registra en la versión compilada: en desarrollo
 * cachearía módulos que cambian a cada guardado y haría imposible ver los cambios.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
/** Cambia en cada novedad; es lo que React compara para volver a pintar. */
let version = 0
const listeners = new Set<() => void>()

const emit = () => {
  version++
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS se presenta como un Mac con pantalla táctil.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Debe llamarse una vez al arrancar: el aviso de instalación puede llegar antes de que React pinte nada. */
export function initPwa(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).toString())
      .catch((err) => console.warn('DayFlow no pudo registrar el service worker.', err))
  })
  navigator.serviceWorker.addEventListener('controllerchange', emit)
  // Al pulsar un aviso con la app ya abierta, el service worker pide ir a esa pantalla.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const data = e.data as { type?: string; hash?: unknown } | null
    if (data?.type === 'navigate' && typeof data.hash === 'string' && data.hash.startsWith('#/')) {
      window.location.hash = data.hash
    }
  })
}

export interface InstallInfo {
  /** El navegador ofrece instalar con un botón nuestro. */
  canInstall: boolean
  installed: boolean
  ios: boolean
  /** La app ya está en caché y abre sin conexión. */
  offlineReady: boolean
  /** Hay service worker en esta compilación (no en desarrollo). */
  offlineSupported: boolean
}

export function useInstall(): InstallInfo & { promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'> } {
  useSyncExternalStore(subscribe, () => version)
  return {
    canInstall: deferredPrompt !== null,
    installed: isStandalone(),
    ios: isIOS(),
    offlineSupported: import.meta.env.PROD && 'serviceWorker' in navigator,
    offlineReady: 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
    promptInstall: async () => {
      if (!deferredPrompt) return 'unavailable'
      const prompt = deferredPrompt
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      // El evento solo sirve una vez.
      deferredPrompt = null
      emit()
      return outcome
    },
  }
}
