import type { BlockCategory, Clock, ISODate, Priority } from '@/types'
import { clockFromMinutes, minutesFromClock } from './date'
import { parseQuickAdd, type ParseContext, type ParsedTask } from './quickAdd'

/**
 * De lo que se escribe en el cuadro «Añadir» de la agenda a algo que crear:
 * una tarea (con su fecha) o un bloque de agenda (con su franja horaria).
 *
 * Reglas de qué es cada cosa:
 *  - Una franja escrita («16:00-17:30», «de 9 a 11») es un bloque.
 *  - Si se pulsó una hora de la rejilla, se entiende que se quiere un bloque ahí.
 *  - Lo demás es una tarea.
 * El usuario puede cambiarlo con el selector; `force` es esa elección.
 */

export type QuickKind = 'task' | 'block'

export type QuickDraft =
  | {
      kind: 'task'
      title: string
      dueDate: ISODate
      dueTime: Clock | null
      priority: Priority
      estimateMin: number | null
      subjectId: string | null
    }
  | {
      kind: 'block'
      title: string
      date: ISODate
      start: Clock
      end: Clock
      category: BlockCategory
      subjectId: string | null
    }

export interface QuickContext extends ParseContext {
  /** Día elegido en la agenda: es el que se usa si en el texto no se escribe ninguno. */
  anchor: ISODate
  /** Hora (minutos) de la rejilla que se pulsó, si se creó desde ahí. */
  pressedMinutes: number | null
  /** Hora de inicio por defecto de un bloque sin hora (minutos). */
  defaultStartMinutes: number
}

export interface QuickResult {
  parsed: ParsedTask
  /** Lo que parece por lo escrito, antes de lo que el usuario fuerce. */
  detected: QuickKind
  /** Lo que se creará; `null` si falta el título. */
  draft: QuickDraft | null
}

const DEFAULT_BLOCK_MIN = 60
const LAST_MINUTE = 23 * 60 + 59

export function draftFromText(text: string, ctx: QuickContext, force: QuickKind | null = null): QuickResult {
  const parsed = parseQuickAdd(text, ctx)
  const detected: QuickKind = parsed.endTime !== null || ctx.pressedMinutes !== null ? 'block' : 'task'
  const kind = force ?? detected

  if (!parsed.title) return { parsed, detected, draft: null }

  // Un día escrito manda; si no, el elegido en la agenda (no «hoy» por defecto).
  const date = parsed.dateExplicit && parsed.dueDate ? parsed.dueDate : ctx.anchor

  if (kind === 'task') {
    return {
      parsed,
      detected,
      draft: {
        kind: 'task',
        title: parsed.title,
        dueDate: date,
        dueTime: parsed.dueTime ?? (force === 'task' && ctx.pressedMinutes !== null ? clockFromMinutes(ctx.pressedMinutes) : null),
        priority: parsed.priority ?? 'medium',
        estimateMin: parsed.estimateMin,
        subjectId: parsed.subjectId,
      },
    }
  }

  const startMinutes = parsed.dueTime
    ? minutesFromClock(parsed.dueTime)
    : (ctx.pressedMinutes ?? ctx.defaultStartMinutes)
  const start = Math.min(LAST_MINUTE - 15, Math.max(0, startMinutes))
  const wanted = parsed.endTime
    ? minutesFromClock(parsed.endTime)
    : start + (parsed.estimateMin ?? DEFAULT_BLOCK_MIN)
  // Nunca una franja vacía o al revés, ni pasada de medianoche.
  const end = Math.min(LAST_MINUTE, wanted > start ? wanted : start + DEFAULT_BLOCK_MIN)

  return {
    parsed,
    detected,
    draft: {
      kind: 'block',
      title: parsed.title,
      date,
      start: clockFromMinutes(start),
      end: clockFromMinutes(end),
      category: parsed.subjectId ? 'study' : 'deep_work',
      subjectId: parsed.subjectId,
    },
  }
}
