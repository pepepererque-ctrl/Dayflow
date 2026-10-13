import { todayISO } from '@/lib/date'
import { newTask } from '@/store/AppStore'
import { parseQuickAdd, type ParseContext, type ParsedTask } from '@/lib/quickAdd'
import type { Task, TaskStatus } from '@/types'

/** Overdue = due before today and not finished. */
export function isOverdue(task: Task, today: string = todayISO()): boolean {
  return task.status !== 'done' && Boolean(task.dueDate) && (task.dueDate as string) < today
}

/**
 * Tarea a partir de una frase ya analizada. Una fecha futura la deja en la
 * lista de pendientes con su fecha (no en «hoy»), y la de hoy en «hoy».
 */
export function taskFromParsed(parsed: ParsedTask, fallback: TaskStatus, today: string): Task {
  const dated = parsed.dueDate
  const status: TaskStatus =
    dated && (fallback === 'today' || fallback === 'backlog')
      ? dated <= today
        ? 'today'
        : 'backlog'
      : fallback
  return newTask({
    title: parsed.title,
    status,
    priority: parsed.priority ?? 'medium',
    category: parsed.subjectId ? 'learning' : 'work',
    dueDate: dated ?? (status === 'today' || status === 'in_progress' ? today : null),
    dueTime: parsed.dueTime,
    estimateMin: parsed.estimateMin,
    subjectId: parsed.subjectId,
  })
}

/**
 * Builds a task from just a title, for the one-line quick-add inputs. Con
 * `ctx` entiende lenguaje natural: «entrega SI viernes 23:59 !alta».
 */
export function quickAddTask(title: string, status: TaskStatus = 'today', ctx?: ParseContext): Task {
  if (ctx) {
    const parsed = parseQuickAdd(title, ctx)
    if (parsed.title) return taskFromParsed(parsed, status, ctx.today)
  }
  return newTask({
    title: title.trim(),
    status,
    dueDate: status === 'today' || status === 'in_progress' ? todayISO() : null,
  })
}
