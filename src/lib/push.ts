import { useSyncExternalStore } from 'react'
import type { Notice } from './notify'
import { supabase } from './supabase'

/**
 * Avisos push: llegan aunque DayFlow esté cerrado.
 *
 * Este dispositivo se registra en el servidor (tabla `dayflow_push_subscriptions`) y le
 * sube su calendario de avisos de los próximos días (`dayflow_push_queue`). Cada minuto
 * el servidor mira qué toca y lo envía; el navegador lo recibe en el service worker
 * (`public/sw.js`) y lo muestra. El móvil lo refleja en el reloj emparejado.
 *
 * Hace falta la sesión de la nube: el servidor tiene que saber de quién es cada aviso.
 */

/** Clave pública VAPID del servidor (la privada nunca sale de él). */
export const VAPID_PUBLIC_KEY =
  'BFDgPLRUxMZWQrroiCntGx1aING4Y4CwTMZi0cX4bTsE0Gz8bCQ4Jn60N1Hcn-Y5dRSPHV4Fzh7arQnP1-laS_k'

const FLAG_KEY = 'dayflow.push.v1'
const FLAG_EVENT = 'dayflow:push'
const SUBS = 'dayflow_push_subscriptions'
const FUNCTION = 'dayflow-push'

/** El navegador puede recibir push. En desarrollo no hay service worker, así que tampoco. */
export function pushSupported(): boolean {
  return (
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/* ------------------------- este dispositivo ya está dado de alta ------------------------- */

/** Dirección del dispositivo registrada en este navegador, o null si no lo está. */
export function pushEndpoint(): string | null {
  try {
    return localStorage.getItem(FLAG_KEY)
  } catch {
    return null
  }
}

function setEndpoint(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(FLAG_KEY, endpoint)
    else localStorage.removeItem(FLAG_KEY)
  } catch {
    /* sin almacenamiento solo se pierde saber si estaba registrado; el alta es idempotente */
  }
  window.dispatchEvent(new Event(FLAG_EVENT))
}

function subscribeFlag(fn: () => void) {
  window.addEventListener(FLAG_EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(FLAG_EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}

/** Verdadero cuando este dispositivo recibe los avisos desde el servidor. */
export function usePushActive(): boolean {
  return useSyncExternalStore(
    subscribeFlag,
    () => pushEndpoint() !== null,
    () => false,
  )
}

/* --------------------------------- alta y baja --------------------------------- */

function applicationServerKey(): Uint8Array {
  const padded = VAPID_PUBLIC_KEY + '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function subscription(create: boolean): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  const existing = await registration.pushManager.getSubscription()
  if (existing || !create) return existing
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey() as BufferSource,
  })
}

async function saveSubscription(sub: PushSubscription, userId: string): Promise<boolean> {
  const client = supabase()
  const keys = sub.toJSON().keys
  if (!client || !keys?.p256dh || !keys.auth) return false
  const { error } = await client.from(SUBS).upsert(
    {
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: keys.p256dh,
      auth_secret: keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  return !error
}

/**
 * Registra este dispositivo en el servidor. Se puede llamar las veces que haga falta:
 * reutiliza la suscripción que ya exista. Requiere el permiso de avisos concedido.
 */
export async function enablePush(userId: string): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    let sub = await subscription(true)
    if (!sub) return false
    let saved = await saveSubscription(sub, userId)
    if (!saved) {
      // La dirección pudo quedar de otra cuenta en este navegador: se empieza con una nueva.
      await sub.unsubscribe()
      sub = await subscription(true)
      saved = sub ? await saveSubscription(sub, userId) : false
    }
    if (!saved || !sub) return false
    setEndpoint(sub.endpoint)
    return true
  } catch (err) {
    console.warn('DayFlow no pudo registrar los avisos push.', err)
    return false
  }
}

/** Da de baja este dispositivo: el servidor deja de avisarle. Hay que llamarla antes de cerrar sesión. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) {
    setEndpoint(null)
    return
  }
  try {
    const sub = await subscription(false)
    if (sub) {
      await supabase()?.from(SUBS).delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch (err) {
    console.warn('DayFlow no pudo dar de baja los avisos push.', err)
  }
  setEndpoint(null)
}

/** ¿Sigue existiendo la suscripción de este navegador? Si el sistema la retiró, hay que volver a darse de alta. */
export async function pushStillValid(): Promise<boolean> {
  const endpoint = pushEndpoint()
  if (!endpoint || !pushSupported()) return false
  try {
    return (await subscription(false))?.endpoint === endpoint
  } catch {
    return false
  }
}

/* ------------------------------ calendario de avisos ------------------------------ */

/** Sustituye el calendario de avisos pendientes de este dispositivo por `notices`. */
export async function uploadSchedule(notices: Notice[]): Promise<boolean> {
  const client = supabase()
  const endpoint = pushEndpoint()
  if (!client || !endpoint) return false
  const { error } = await client.rpc('dayflow_push_replace', {
    p_endpoint: endpoint,
    p_notices: notices.map(({ key, at, eventAt, title, body, url }) => ({ key, at, eventAt, title, body, url })),
  })
  return !error
}

/** Pide al servidor que envíe un aviso de prueba a este dispositivo. */
export async function sendPushTest(): Promise<boolean> {
  const client = supabase()
  const endpoint = pushEndpoint()
  if (!client || !endpoint) return false
  const { data, error } = await client.functions.invoke(FUNCTION, { body: { action: 'test', endpoint } })
  return !error && (data as { sent?: number } | null)?.sent === 1
}
