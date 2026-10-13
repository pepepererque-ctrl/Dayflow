import type { AppState, ISODate, Subject, Task } from '@/types'
import { startOfWeek } from './date'

/** Lo que cabe en un chip: las siglas si las hay, y si no el nombre. */
export function subjectShort(subject: Subject): string {
  return subject.code || subject.name
}

export interface SubjectStats {
  openTasks: Task[]
  doneTasks: number
  /** La tarea abierta con fecha más cercana (las atrasadas cuentan primero). */
  nextDue: Task | null
  overdue: number
  minutesTotal: number
  minutesWeek: number
}

const byDue = (a: Task, b: Task) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')

/** Todo lo que cuelga de una asignatura, calculado desde el estado único. */
export function subjectStats(
  state: AppState,
  subjectId: string,
  today: ISODate,
): SubjectStats {
  const tasks = state.tasks.filter((t) => t.subjectId === subjectId)
  const open = tasks.filter((t) => t.status !== 'done')
  const dated = open.filter((t) => t.dueDate).sort(byDue)
  const weekStart = startOfWeek(today, state.settings.weekStartsOn)

  let minutesTotal = 0
  let minutesWeek = 0
  for (const s of state.sessions) {
    if (s.subjectId !== subjectId) continue
    minutesTotal += s.actualMinutes
    if (s.date >= weekStart && s.date <= today) minutesWeek += s.actualMinutes
  }

  return {
    openTasks: [...open].sort(byDue),
    doneTasks: tasks.length - open.length,
    nextDue: dated[0] ?? null,
    overdue: dated.filter((t) => (t.dueDate as string) < today).length,
    minutesTotal,
    minutesWeek,
  }
}

/** Suma de créditos de las asignaturas que cuentan como "en curso". */
export function activeCredits(subjects: Subject[]): number {
  return subjects
    .filter((s) => s.status === 'active' || s.status === 'recovery')
    .reduce((sum, s) => sum + s.credits, 0)
}

/** 4,5 en vez de 4.5: los créditos medios se escriben con coma. */
export const formatCredits = (n: number): string => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

export const isOpenSubject = (s: Subject) => s.status === 'active' || s.status === 'recovery'
