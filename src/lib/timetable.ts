import type { AppState, ClassSlot, ISODate, Subject, Timetable } from '@/types'
import { addDays, dayOfWeek, diffDays, minutesFromClock } from './date'
import { isOpenSubject } from './subjects'

type TimetableState = Pick<AppState, 'subjects'> & { timetable: Timetable }

/** Una clase concreta en una fecha concreta. */
export interface ClassOccurrence {
  slot: ClassSlot
  subject: Subject
  date: ISODate
  /** Minutos desde medianoche. */
  start: number
  end: number
}

/** ¿Hay clase ese día? Fuera del periodo o en un día sin clase, no. */
export function isTeachingDate(tt: Timetable, date: ISODate): boolean {
  if (tt.termStart && date < tt.termStart) return false
  if (tt.termEnd && date > tt.termEnd) return false
  return !tt.breaks.some((b) => date >= b.from && date <= b.to)
}

/** Motivo por el que un día no tiene clase, si lo hay (para explicarlo en la interfaz). */
export function breakOn(tt: Timetable, date: ISODate): string | null {
  const found = tt.breaks.find((b) => date >= b.from && date <= b.to)
  return found ? found.label || '' : null
}

/**
 * Las clases de una fecha. Las asignaturas ya cerradas (aprobadas o suspensas)
 * no cuentan: su horario deja de ocupar la agenda.
 */
export function classesOn(state: TimetableState, date: ISODate): ClassOccurrence[] {
  if (!state.timetable.slots.length || !isTeachingDate(state.timetable, date)) return []
  const dow = dayOfWeek(date)
  const subjects = new Map(state.subjects.map((s) => [s.id, s]))
  const out: ClassOccurrence[] = []
  for (const slot of state.timetable.slots) {
    if (slot.weekday !== dow) continue
    const subject = subjects.get(slot.subjectId)
    if (!subject || !isOpenSubject(subject)) continue
    out.push({ slot, subject, date, start: minutesFromClock(slot.start), end: minutesFromClock(slot.end) })
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end)
}

export interface NextClass {
  occurrence: ClassOccurrence
  /** Días que faltan (0 = hoy). */
  days: number
}

/**
 * La primera clase que aún no ha terminado: la de ahora mismo si hay una en
 * curso, y si no la siguiente, aunque sea en otro día (hasta `horizon` días).
 */
export function nextClass(
  state: TimetableState,
  today: ISODate,
  nowMinutes: number,
  horizon = 14,
): NextClass | null {
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(today, i)
    const found = classesOn(state, date).find((c) => i > 0 || c.end > nowMinutes)
    if (found) return { occurrence: found, days: diffDays(date, today) }
  }
  return null
}

/** Clases semanales que se solapan con la franja dada, para avisar al editarla. */
export function overlappingSlots(
  slots: ClassSlot[],
  candidate: { weekday: number; start: string; end: string },
  ignoreId?: string,
): ClassSlot[] {
  const a = minutesFromClock(candidate.start)
  const b = minutesFromClock(candidate.end)
  return slots.filter(
    (s) =>
      s.id !== ignoreId &&
      s.weekday === candidate.weekday &&
      a < minutesFromClock(s.end) &&
      b > minutesFromClock(s.start),
  )
}

/** Minutos semanales de clase (cada franja una vez). */
export function weeklyClassMinutes(state: TimetableState): number {
  const open = new Set(state.subjects.filter(isOpenSubject).map((s) => s.id))
  return state.timetable.slots
    .filter((s) => open.has(s.subjectId))
    .reduce((sum, s) => sum + minutesFromClock(s.end) - minutesFromClock(s.start), 0)
}

export type Laned<T> = T & { lane: number; lanes: number }

/**
 * Reparte en carriles lo que se solapa, para dibujarlo en paralelo en vez de
 * apilado. Cada grupo de elementos encadenados comparte el mismo nº de carriles.
 */
export function layoutLanes<T extends { start: number; end: number }>(items: T[]): Laned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Laned<T>[] = []
  let cluster: Laned<T>[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []

  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length
    out.push(...cluster)
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    cluster.push({ ...item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return out
}
