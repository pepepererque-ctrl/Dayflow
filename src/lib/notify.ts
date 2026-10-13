import { useSyncExternalStore } from 'react'
import { es } from '@/i18n/es'
import type { AppState, ISODate } from '@/types'
import { formatClock, fromISO, minutesFromClock, toISO } from './date'
import { listExams } from './exams'
import { classesOn } from './timetable'

/**
 * Avisos de clases, estudio, entregas y exámenes.
 *
 * Funcionan sin servidor: DayFlow calcula qué toca avisar y lo muestra mientras
 * está abierto (en una pestaña o como app instalada en segundo plano). No hay
 * avisos con la app cerrada del todo: eso exige un servidor de notificaciones
 * push, que esta app no tiene.
 */

export interface NotifyPrefs {
  enabled: boolean
  classes: boolean
  blocks: boolean
  tasks: boolean
  exams: boolean
  /** Minutos de antelación para clases, bloques y tareas con hora. */
  leadMin: number
}

export const LEAD_OPTIONS = [5, 10, 15, 30, 60]

export const DEFAULT_PREFS: NotifyPrefs = {
  enabled: false,
  classes: true,
  blocks: true,
  tasks: true,
  exams: true,
  leadMin: 15,
}

const PREFS_KEY = 'dayflow.notify.v1'
const FIRED_KEY = 'dayflow.notified.v1'
const PREFS_EVENT = 'dayflow:notify-prefs'

/** Los avisos ya mostrados se recuerdan unos días, para no repetirlos al recargar. */
const FIRED_TTL_MS = 3 * 24 * 3600 * 1000
/** Máximo de avisos seguidos; si hay más se resumen en uno. */
const MAX_BURST = 3

/* --------------------------------- ajustes --------------------------------- */

export function loadPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS
    const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
    return {
      enabled: bool(raw.enabled, false),
      classes: bool(raw.classes, true),
      blocks: bool(raw.blocks, true),
      tasks: bool(raw.tasks, true),
      exams: bool(raw.exams, true),
      leadMin: LEAD_OPTIONS.includes(raw.leadMin) ? raw.leadMin : DEFAULT_PREFS.leadMin,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

let cachedPrefs: NotifyPrefs | null = null

function currentPrefs(): NotifyPrefs {
  if (!cachedPrefs) cachedPrefs = loadPrefs()
  return cachedPrefs
}

export function savePrefs(next: NotifyPrefs): void {
  cachedPrefs = next
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* sin almacenamiento los ajustes duran lo que la sesión */
  }
  window.dispatchEvent(new Event(PREFS_EVENT))
}

function subscribePrefs(fn: () => void) {
  const refresh = () => {
    cachedPrefs = null
    fn()
  }
  window.addEventListener(PREFS_EVENT, fn)
  // Otra pestaña cambió los ajustes.
  window.addEventListener('storage', refresh)
  return () => {
    window.removeEventListener(PREFS_EVENT, fn)
    window.removeEventListener('storage', refresh)
  }
}

export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore(subscribePrefs, currentPrefs, () => DEFAULT_PREFS)
}

/* -------------------------------- permisos --------------------------------- */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/* ------------------------------ qué se avisa -------------------------------- */

export interface Notice {
  /** Identifica el aviso para no repetirlo; incluye fecha y hora, así que si algo se mueve vuelve a avisar. */
  key: string
  /** Cuándo toca avisar. */
  at: number
  /** Cuándo ocurre lo avisado. Pasado ese momento el aviso ya no sirve. */
  eventAt: number
  title: string
  body: string
  /** Pantalla a la que lleva al pulsarlo. */
  url: string
}

/** Instante local de `minutes` minutos después de las 00:00 de `date` (admite valores negativos o >1439). */
function at(date: ISODate, minutes: number): number {
  const d = fromISO(date)
  d.setHours(0, minutes, 0, 0)
  return d.getTime()
}

const endOfDay = (date: ISODate) => at(date, 24 * 60 - 1)

/**
 * Los avisos de hoy. Se calcula entero cada vez a partir del estado, así lo que
 * se edite (una clase, una tarea, un examen) se refleja sin mantener ninguna cola.
 */
export function buildNotices(
  state: Pick<AppState, 'subjects' | 'timetable' | 'blocks' | 'tasks'>,
  nowMs: number,
  prefs: NotifyPrefs,
): Notice[] {
  const today = toISO(new Date(nowMs))
  const lead = prefs.leadMin
  const out: Notice[] = []

  if (prefs.classes) {
    for (const c of classesOn(state, today)) {
      out.push({
        key: `class:${c.slot.id}:${today}`,
        at: at(today, c.start - lead),
        eventAt: at(today, c.start),
        title: es['notify.classTitle']({ subject: c.subject.name }),
        body: es['notify.classBody']({ time: formatClock(c.slot.start), room: c.slot.room }),
        url: '#/timetable',
      })
    }
  }

  if (prefs.blocks) {
    for (const b of state.blocks) {
      if (b.date !== today || b.done) continue
      const start = minutesFromClock(b.start)
      out.push({
        key: `block:${b.id}:${today}:${b.start}`,
        at: at(today, start - lead),
        eventAt: at(today, start),
        title: b.title,
        body: es['notify.blockBody']({ time: formatClock(b.start) }),
        url: '#/planner',
      })
    }
  }

  if (prefs.tasks) {
    for (const task of state.tasks) {
      if (task.status === 'done' || task.dueDate !== today) continue
      if (task.dueTime) {
        const due = minutesFromClock(task.dueTime)
        out.push({
          key: `task:${task.id}:${today}:${task.dueTime}`,
          at: at(today, due - lead),
          eventAt: at(today, due),
          title: es['notify.taskTimedTitle']({ time: formatClock(task.dueTime) }),
          body: task.title,
          url: '#/tasks',
        })
      } else {
        // Sin hora: un único recordatorio por la mañana.
        out.push({
          key: `task:${task.id}:${today}:day`,
          at: at(today, 8 * 60 + 30),
          eventAt: endOfDay(today),
          title: es['notify.taskDayTitle'],
          body: task.title,
          url: '#/tasks',
        })
      }
    }
  }

  if (prefs.exams) {
    for (const exam of listExams(state.subjects, today).upcoming) {
      if (exam.item.grade !== null || exam.days > 1) continue
      const time = exam.item.time
      const body = es['notify.examBody']({
        subject: exam.subject.name,
        time: time ? formatClock(time) : '',
        room: exam.item.room,
      })
      if (exam.days === 1) {
        // La víspera por la tarde, cuando aún da tiempo de repasar.
        out.push({
          key: `exam:${exam.item.id}:${exam.date}:eve`,
          at: at(today, 19 * 60),
          eventAt: time ? at(exam.date, minutesFromClock(time)) : endOfDay(exam.date),
          title: es['notify.examEveTitle']({ name: exam.item.name }),
          body,
          url: '#/exams',
        })
      } else {
        out.push({
          key: `exam:${exam.item.id}:${exam.date}:day`,
          at: time ? at(today, minutesFromClock(time) - 60) : at(today, 8 * 60),
          eventAt: time ? at(today, minutesFromClock(time)) : endOfDay(today),
          title: es['notify.examDayTitle']({ name: exam.item.name }),
          body,
          url: '#/exams',
        })
      }
    }
  }

  return out.sort((a, b) => a.at - b.at)
}

/** Los que ya tocan y todavía sirven: ni futuros, ni pasados del suceso, ni ya mostrados. */
export function dueNotices(notices: Notice[], nowMs: number, fired: Record<string, number>): Notice[] {
  return notices.filter((n) => n.at <= nowMs && nowMs < n.eventAt && !fired[n.key])
}

/* ------------------------------ ya mostrados -------------------------------- */

export function readFired(nowMs = Date.now()): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number' && nowMs - t < FIRED_TTL_MS))
  } catch {
    return {}
  }
}

export function markFired(keys: string[], nowMs = Date.now()): void {
  const fired = readFired(nowMs)
  for (const key of keys) fired[key] = nowMs
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired))
  } catch {
    /* si no se puede recordar, el peor caso es repetir un aviso */
  }
}

/* -------------------------------- mostrar ---------------------------------- */

/**
 * Muestra una notificación. Con service worker se usa su registro, que es lo
 * único que admite Android; sin él (escritorio en desarrollo) se usa la API directa.
 */
export async function showNotice(n: Pick<Notice, 'title' | 'body' | 'url'> & { tag?: string }): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const icon = new URL('icon-192.png', document.baseURI).toString()
  const options: NotificationOptions = {
    body: n.body,
    tag: n.tag,
    icon,
    badge: icon,
    lang: 'es',
    data: { url: n.url },
  }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(n.title, options)
      return true
    }
    const note = new Notification(n.title, options)
    note.onclick = () => {
      window.focus()
      window.location.hash = n.url
      note.close()
    }
    return true
  } catch {
    return false
  }
}

/** Muestra los avisos que toquen; si son muchos de golpe, tres y un resumen. */
export async function fireDue(due: Notice[]): Promise<void> {
  const shown = due.slice(0, MAX_BURST)
  for (const n of shown) await showNotice({ title: n.title, body: n.body, url: n.url, tag: n.key })
  const rest = due.length - shown.length
  if (rest > 0) {
    await showNotice({ title: es['notify.more']({ n: rest }), body: '', url: '#/today', tag: 'dayflow-more' })
  }
}
