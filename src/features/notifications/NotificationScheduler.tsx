import { useEffect, useRef } from 'react'
import {
  buildNotices,
  dueNotices,
  fireDue,
  markFired,
  notificationPermission,
  readFired,
  useNotifyPrefs,
} from '@/lib/notify'
import { usePushActive } from '@/lib/push'
import { useApp } from '@/store/AppStore'

/** Cada cuánto se mira si toca avisar. Medio minuto basta para avisos que se dan al minuto. */
const TICK_MS = 30_000

/**
 * Comprueba periódicamente qué avisos tocan y los muestra. No pinta nada.
 * Solo trabaja con los avisos activados y el permiso concedido, y se aparta cuando
 * los avisos de este dispositivo ya los envía el servidor (si no, saldrían dos veces).
 */
export function NotificationScheduler() {
  const { state } = useApp()
  const prefs = useNotifyPrefs()
  const serverSends = usePushActive()
  // El temporizador lee siempre el estado más reciente sin reiniciarse a cada cambio.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!prefs.enabled || serverSends || notificationPermission() !== 'granted') return

    const tick = () => {
      const now = Date.now()
      const due = dueNotices(buildNotices(stateRef.current, now, prefs), now, readFired(now))
      if (!due.length) return
      // Se marcan antes de mostrarlos: si mostrarlos falla, no se reintenta en bucle.
      markFired(
        due.map((n) => n.key),
        now,
      )
      void fireDue(due)
    }

    tick()
    const id = window.setInterval(tick, TICK_MS)
    // Al volver a la pestaña, el temporizador pudo haberse frenado: se comprueba al momento.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [prefs, serverSends])

  return null
}
