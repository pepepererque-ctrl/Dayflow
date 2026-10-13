import { Check, Clock3, Flag, GripVertical, Timer, Trash2 } from 'lucide-react'
import { Badge, Dot } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { CATEGORIES, PRIORITIES, colorVar } from '@/lib/constants'
import { formatClock } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import { useApp } from '@/store/AppStore'
import { SubjectChip } from '../subjects/SubjectBits'
import type { Task } from '@/types'
import { isOverdue } from './taskUtils'

export function TaskCheckbox({
  done,
  onToggle,
  label,
  size = 20,
}: {
  done: boolean
  onToggle: () => void
  label: string
  size?: number
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      style={{ width: size, height: size }}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
        // Completar una tarea es la acción principal de la fila. El círculo se
        // queda en 20px, pero el pseudoelemento lleva el área de pulsación a
        // 44px sin mover nada de sitio.
        "before:absolute before:-inset-3 before:content-['']",
        done
          ? 'border-brand bg-brand text-[var(--on-brand)]'
          : 'border-line-strong text-transparent hover:border-brand hover:bg-brand-soft',
      )}
    >
      <Check size={size * 0.6} strokeWidth={3} className={cn('transition-transform duration-200', done ? 'scale-100' : 'scale-50')} />
    </button>
  )
}

function TaskMeta({ task, showDate }: { task: Task; showDate?: boolean }) {
  const { state } = useApp()
  const t = useT()
  const relDay = useRelativeDay()
  const goal = task.goalId ? state.goals.find((g) => g.id === task.goalId) : null
  const subject = task.subjectId ? state.subjects.find((s) => s.id === task.subjectId) : null
  const overdue = isOverdue(task)

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-3">
      {/* La asignatura es más concreta que la categoría: la sustituye. */}
      {subject ? (
        <SubjectChip subject={subject} className="max-w-[12rem]" />
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Dot color={CATEGORIES[task.category].color} size={6} />
          {t(CATEGORIES[task.category].labelKey)}
        </span>
      )}

      {(task.priority === 'urgent' || task.priority === 'high') && (
        <span
          className="inline-flex items-center gap-1 font-medium"
          style={{ color: colorVar(PRIORITIES[task.priority].color) }}
        >
          <Flag size={11} strokeWidth={2.4} />
          {t(PRIORITIES[task.priority].labelKey)}
        </span>
      )}

      {task.dueTime ? (
        <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-bad')}>
          <Clock3 size={11} />
          {formatClock(task.dueTime)}
        </span>
      ) : null}

      {showDate && task.dueDate ? (
        <span className={cn(overdue && 'font-medium text-bad')}>
          {overdue ? t('tasks.overduePrefix') : ''}
          {relDay(task.dueDate)}
        </span>
      ) : null}

      {task.estimateMin ? (
        <span className="inline-flex items-center gap-1">
          <Timer size={11} />
          {task.estimateMin}m
        </span>
      ) : null}

      {/* El tope solo evita que una meta larga se coma la fila entera. A 180px
          recortaba títulos que cabían de sobra en el ancho disponible. */}
      {goal ? (
        <span
          className="inline-flex max-w-[min(100%,22rem)] items-center gap-1 truncate"
          title={goal.title}
        >
          <Flag size={11} style={{ color: colorVar(goal.color) }} />
          <span className="truncate">{goal.title}</span>
        </span>
      ) : null}
    </div>
  )
}

/** Dense list row used on Today and in the Tasks list view. */
export function TaskRow({
  task,
  onOpen,
  onDelete,
  showDate,
  className,
}: {
  task: Task
  onOpen: (task: Task) => void
  onDelete?: (task: Task) => void
  showDate?: boolean
  className?: string
}) {
  const { dispatch } = useApp()
  const t = useT()
  const done = task.status === 'done'

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2',
        className,
      )}
    >
      <div className="pt-0.5">
        <TaskCheckbox
          done={done}
          label={done ? t('tasks.uncomplete', { title: task.title }) : t('tasks.complete', { title: task.title })}
          onToggle={() => dispatch({ type: 'toggleTask', id: task.id })}
        />
      </div>

      <button
        type="button"
        onClick={() => onOpen(task)}
        // El relleno vertical lo absorbe el margen negativo: crece el área de
        // pulsación de una tarea completada sin cambiar el ritmo de la lista.
        className="-my-1.5 min-w-0 flex-1 py-1.5 text-left"
        aria-label={t('tasks.open', { title: task.title })}
      >
        <p
          className={cn(
            'truncate text-base font-medium transition-colors',
            done ? 'text-ink-3 line-through' : 'text-ink',
          )}
        >
          {task.title}
        </p>
        {!done ? <TaskMeta task={task} showDate={showDate} /> : null}
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task)
          }}
          aria-label={t('tasks.deleteLabel', { title: task.title })}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 opacity-0 transition-all hover:bg-bad/10 hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  )
}

/** Draggable card used in the board view. */
export function TaskCard({
  task,
  onOpen,
  dragging,
  ...dragProps
}: {
  task: Task
  onOpen: (task: Task) => void
  dragging?: boolean
} & React.HTMLAttributes<HTMLDivElement>) {
  const { dispatch } = useApp()
  const t = useT()
  const done = task.status === 'done'

  return (
    <div
      {...dragProps}
      className={cn(
        'group cursor-grab rounded-xl border border-line bg-surface p-3 shadow-card transition-all duration-150',
        'hover:border-line-strong hover:shadow-pop active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <TaskCheckbox
            size={18}
            done={done}
            label={done ? t('tasks.uncomplete', { title: task.title }) : t('tasks.complete', { title: task.title })}
            onToggle={() => dispatch({ type: 'toggleTask', id: task.id })}
          />
        </div>
        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <p className={cn('text-sm font-medium leading-snug', done ? 'text-ink-3 line-through' : 'text-ink')}>
            {task.title}
          </p>
          <TaskMeta task={task} showDate />
        </button>
        <GripVertical size={14} className="mt-0.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-60" />
      </div>
    </div>
  )
}

export function PriorityBadge({ task }: { task: Task }) {
  const t = useT()
  const meta = PRIORITIES[task.priority]
  return <Badge color={meta.color}>{t(meta.labelKey)}</Badge>
}
