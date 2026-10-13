import { es } from '@/i18n/es'
import type { AppState, ColorKey, ISODate } from '@/types'
import { BLOCK_CATEGORIES, CATEGORIES, CLASS_KINDS } from './constants'
import { addDays, fromISO, minutesFromClock, startOfWeek, toISO } from './date'
import { listExams } from './exams'
import { classesOn } from './timetable'

/**
 * Todo lo que pasa en un día, unificado para la agenda: exámenes, entregas,
 * bloques de agenda/estudio y clases. Es lo que alimenta tanto las barras de
 * color del mes como la lista del día.
 */

export type AgendaKind = 'exam' | 'task' | 'block' | 'class'

/** Color de una barra: el de la asignatura o categoría, o `exam`, que siempre es rojo. */
export type AgendaTone = ColorKey | 'exam'

export interface AgendaItem {
  /** Único en la agenda: tipo, origen y fecha. */
  id: string
  kind: AgendaKind
  /** Id del examen, tarea, bloque o clase de origen. */
  refId: string
  date: ISODate
  /** Minutos desde medianoche; `null` = todo el día. */
  start: number | null
  end: number | null
  title: string
  /** Segunda línea ya redactada (asignatura, aula…). */
  detail: string
  tone: AgendaTone
  done: boolean
  subjectId: string | null
}

type AgendaState = Pick<AppState, 'subjects' | 'timetable' | 'blocks' | 'tasks'>

const text = (key: keyof typeof es) => es[key] as string

/** Primero lo de todo el día (exámenes antes que entregas), luego por hora. */
const order = (a: AgendaItem, b: AgendaItem) => {
  const rank = (i: AgendaItem) => (i.start === null ? (i.kind === 'exam' ? 0 : 1) : 2)
  return rank(a) - rank(b) || (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0)
}

/**
 * Los elementos de cada fecha pedida. Se calcula de una vez para varias fechas
 * (un mes entero) en lugar de recorrer el estado día a día.
 */
export function buildAgenda(state: AgendaState, dates: ISODate[], today: ISODate): Map<ISODate, AgendaItem[]> {
  const wanted = new Set(dates)
  const subjects = new Map(state.subjects.map((s) => [s.id, s]))
  const out = new Map<ISODate, AgendaItem[]>(dates.map((d) => [d, []]))
  const push = (item: AgendaItem) => out.get(item.date)?.push(item)

  const { upcoming, past } = listExams(state.subjects, today)
  for (const e of [...past, ...upcoming]) {
    if (!wanted.has(e.date)) continue
    const time = e.item.time ? minutesFromClock(e.item.time) : null
    push({
      id: `exam:${e.item.id}:${e.date}`,
      kind: 'exam',
      refId: e.item.id,
      date: e.date,
      start: time,
      end: time === null ? null : time + 60,
      title: e.item.name,
      detail: [e.subject.name, e.item.room ? `Aula ${e.item.room}` : ''].filter(Boolean).join(' · '),
      tone: 'exam',
      done: e.item.grade !== null,
      subjectId: e.subject.id,
    })
  }

  for (const task of state.tasks) {
    if (!task.dueDate || !wanted.has(task.dueDate)) continue
    const subject = task.subjectId ? subjects.get(task.subjectId) : undefined
    const time = task.dueTime ? minutesFromClock(task.dueTime) : null
    push({
      id: `task:${task.id}:${task.dueDate}`,
      kind: 'task',
      refId: task.id,
      date: task.dueDate,
      start: time,
      end: null,
      title: task.title,
      detail: subject ? subject.name : text(CATEGORIES[task.category].labelKey),
      tone: subject?.color ?? CATEGORIES[task.category].color,
      done: task.status === 'done',
      subjectId: subject?.id ?? null,
    })
  }

  for (const b of state.blocks) {
    if (!wanted.has(b.date)) continue
    const subject = b.subjectId ? subjects.get(b.subjectId) : undefined
    push({
      id: `block:${b.id}:${b.date}`,
      kind: 'block',
      refId: b.id,
      date: b.date,
      start: minutesFromClock(b.start),
      end: minutesFromClock(b.end),
      title: b.title,
      detail: subject ? subject.name : text(BLOCK_CATEGORIES[b.category].labelKey),
      tone: subject?.color ?? BLOCK_CATEGORIES[b.category].color,
      done: b.done,
      subjectId: subject?.id ?? null,
    })
  }

  for (const date of dates) {
    for (const c of classesOn(state, date)) {
      push({
        id: `class:${c.slot.id}:${date}`,
        kind: 'class',
        refId: c.slot.id,
        date,
        start: c.start,
        end: c.end,
        title: c.subject.name,
        detail: [text(CLASS_KINDS[c.slot.kind].labelKey), c.slot.room].filter(Boolean).join(' · '),
        tone: c.subject.color,
        done: false,
        subjectId: c.subject.id,
      })
    }
  }

  for (const list of out.values()) list.sort(order)
  return out
}

/** Máximo de barras de color en el cuadradito de un día. */
export const MAX_BARS = 3

/**
 * Las barras de un día en la vista de mes. Las clases no se cuentan: se repiten
 * cada semana y llenarían de barras todos los días lectivos; se ven en la lista
 * del día y en las vistas de semana y día. Lo ya hecho tampoco pinta barra.
 */
export function dayBars(items: AgendaItem[]): AgendaTone[] {
  const live = items.filter((i) => i.kind !== 'class' && !i.done)
  // Los exámenes mandan: salen primero y el color del cuadradito es el suyo, tengan hora o no.
  const exams = live.filter((i) => i.kind === 'exam')
  const rest = live.filter((i) => i.kind !== 'exam')
  return [...exams, ...rest].slice(0, MAX_BARS).map((i) => i.tone)
}

/** Las semanas completas que cubren el mes de `anchor`, empezando por `weekStartsOn`. */
export function monthWeeks(anchor: ISODate, weekStartsOn: 0 | 1): ISODate[][] {
  const first = `${anchor.slice(0, 8)}01`
  const d = fromISO(first)
  const last = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const weeks: ISODate[][] = []
  for (let cursor = startOfWeek(first, weekStartsOn); cursor <= last; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
  }
  return weeks
}

/** Mueve la fecha `delta` meses conservando el día, o el último del mes si no existe (31 → 30). */
export function shiftMonth(date: ISODate, delta: number): ISODate {
  const d = fromISO(date)
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return toISO(target)
}

/* ---------------------------- qué se muestra ------------------------------ */

/** Qué tipos de cosas se ven en la agenda; como los calendarios de Samsung, se pueden ocultar. */
export interface AgendaShow {
  classes: boolean
  exams: boolean
  tasks: boolean
  blocks: boolean
}

export const DEFAULT_SHOW: AgendaShow = { classes: true, exams: true, tasks: true, blocks: true }

const SHOW_FOR_KIND: Record<AgendaKind, keyof AgendaShow> = {
  class: 'classes',
  exam: 'exams',
  task: 'tasks',
  block: 'blocks',
}

export function isShown(kind: AgendaKind, show: AgendaShow): boolean {
  return show[SHOW_FOR_KIND[kind]]
}

/** El mismo mapa de días sin lo que está oculto. Si no se oculta nada, devuelve el original. */
export function filterAgenda(agenda: Map<ISODate, AgendaItem[]>, show: AgendaShow): Map<ISODate, AgendaItem[]> {
  if (Object.values(show).every(Boolean)) return agenda
  return new Map([...agenda].map(([date, items]) => [date, items.filter((i) => isShown(i.kind, show))]))
}

/** Lee lo guardado, ignorando cualquier cosa que no sea un booleano por tipo. */
export function parseShow(raw: unknown): AgendaShow {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = (key: keyof AgendaShow) => (typeof src[key] === 'boolean' ? (src[key] as boolean) : true)
  return { classes: pick('classes'), exams: pick('exams'), tasks: pick('tasks'), blocks: pick('blocks') }
}
