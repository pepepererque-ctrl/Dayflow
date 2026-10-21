import { useEffect, useRef } from 'react'
import { buildSchedule, notificationPermission, useNotifyPrefs } from '@/lib/notify'
import {
  disablePush,
  enablePush,
  pushEndpoint,
  pushStillValid,
  pushSupported,
  uploadSchedule,
  usePushActive,
} from '@/lib/push'
import { useApp } from '@/store/AppStore'
import { useSync } from '@/store/SyncProvider'

/** Espera tras un cambio antes de subir el calendario, para no subir a cada tecla. */
const DEBOUNCE_MS = 2000
/** Aunque nada cambie, el horizonte de 7 días se renueva de vez en cuando. */
const REFRESH_MS = 30 * 60 * 1000

/**
 * Mantiene el servidor al día para que los avisos lleguen con la app cerrada:
 * da de alta este dispositivo cuando hay sesión y avisos activados, y sube el
 * calendario de avisos de los próximos días cada vez que cambia. No pinta nada.
 */
export function PushSync() {
  const { state } = useApp()
  const prefs = useNotifyPrefs()
  const { userId } = useSync()
  const registered = usePushActive()
  const stateRef = useRef(state)
  stateRef.current = state
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  /** Lo último que se subió, para no repetir una subida idéntica. */
  const uploaded = useRef<string | null>(null)

  const supported = pushSupported()
  const wanted = supported && prefs.enabled && Boolean(userId)

  // Alta del dispositivo (o renovación si el sistema retiró la suscripción).
  useEffect(() => {
    if (!wanted || !userId) return
    let alive = true
    const register = async () => {
      if (notificationPermission() !== 'granted') return
      if (!(await pushStillValid())) uploaded.current = null
      if (!alive) return
      await enablePush(userId)
    }
    void register()
    return () => {
      alive = false
    }
  }, [wanted, userId])

  // Baja: avisos desactivados, o el permiso se retiró desde los ajustes del navegador.
  useEffect(() => {
    if (!supported) return
    const check = () => {
      if (!pushEndpoint()) return
      if (!prefsRef.current.enabled || notificationPermission() !== 'granted') {
        uploaded.current = null
        void disablePush()
      }
    }
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [supported, prefs.enabled])

  // Calendario: tras cada cambio, al volver a la app y de vez en cuando.
  useEffect(() => {
    if (!wanted || !registered) return
    let alive = true

    const upload = async () => {
      if (!alive || !pushEndpoint() || notificationPermission() !== 'granted') return
      const notices = buildSchedule(stateRef.current, Date.now(), prefsRef.current)
      const signature = `${pushEndpoint()}|${JSON.stringify(notices.map((n) => [n.key, n.at, n.title, n.body]))}`
      if (signature === uploaded.current) return
      if (await uploadSchedule(notices)) uploaded.current = signature
    }

    const timer = window.setTimeout(upload, DEBOUNCE_MS)
    const interval = window.setInterval(() => {
      uploaded.current = null
      void upload()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void upload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // `state` y `prefs` reinician el temporizador: cada cambio sube el calendario una vez que se calma.
  }, [wanted, registered, state, prefs])

  return null
}
