import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Flag, Timer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { PRIORITIES, colorVar } from '@/lib/constants'
import {
  clockFromMinutes,
  dayOfWeek,
  diffDays,
  formatClock,
  formatDuration,
  formatShortDate,
  minutesFromClock,
  weekdayShort,
} from '@/lib/date'
import { uid } from '@/lib/id'
import { draftFromText, type QuickDraft, type QuickKind } from '@/lib/quickCreate'
import { newTask, useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ISODate } from '@/types'
import { SubjectChip } from '../subjects/SubjectBits'

/** Qué se pidió abrir a mano desde «Más opciones», con lo que ya se había escrito. */
export interface QuickMore {
  kind: QuickKind
  draft: QuickDraft | null
  date: ISODate
  /** Hora pulsada en la rejilla, si se creó desde ahí. */
  pressedMinutes: number | null
}

/**
 * El cuadro «Añadir» de la agenda: se escribe en lenguaje natural y se ve, antes
 * de crear, qué se ha entendido. Detecta solo si es una tarea o un bloque de
 * agenda (una franja como «16:00-17:30» lo hace bloque) y se puede cambiar a mano.
 */
export function QuickAddSheet({
  open,
  onClose,
  date,
  pressedMinutes,
  onCreated,
  onMore,
}: {
  open: boolean
  onClose: () => void
  /** Día elegido en la agenda: donde cae lo que no lleva fecha escrita. */
  date: ISODate
  pressedMinutes: number | null
  onCreated: (date: ISODate) => void
  onMore: (more: QuickMore) => void
}) {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const t = useT()

  const [text, setText] = useState('')
  const [force, setForce] = useState<QuickKind | null>(null)

  // Cada vez que se abre, empieza en blanco.
  useEffect(() => {
    if (open) {
      setText('')
      setForce(null)
    }
  }, [open])

  // Sin hora pulsada: hoy, la próxima hora en punto; otro día, cuando empieza tu jornada.
  const defaultStartMinutes =
    date === today
      ? Math.min(22 * 60, (new Date().getHours() + 1) * 60)
      : Math.max(6 * 60, minutesFromClock(state.profile.workStart))

  const result = useMemo(
    () =>
      draftFromText(
        text,
        { today, subjects: state.subjects, anchor: date, pressedMinutes, defaultStartMinutes },
        force,
      ),
    [text, today, state.subjects, date, pressedMinutes, defaultStartMinutes, force],
  )
  const { draft, detected } = result
  const kind: QuickKind = force ?? detected

  const submit = () => {
    if (!draft) {
      toast(t('agenda.needTitle'), { tone: 'error' })
      return
    }
    if (draft.kind === 'task') {
      const task = newTask({
        title: draft.title,
        // Para hoy o antes, a la lista de hoy; más adelante, a pendientes con su fecha.
        status: draft.dueDate <= today ? 'today' : 'backlog',
        priority: draft.priority,
        category: draft.subjectId ? 'learning' : 'work',
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        estimateMin: draft.estimateMin,
        subjectId: draft.subjectId,
      })
      dispatch({ type: 'addTask', task })
      toast(t('agenda.createdTask', { title: draft.title }), {
        actionLabel: t('common.undoDelete'),
        onAction: () => dispatch({ type: 'deleteTask', id: task.id }),
      })
      onCreated(draft.dueDate)
    } else {
      const id = uid('blk')
      dispatch({
        type: 'addBlock',
        block: {
          id,
          title: draft.title,
          date: draft.date,
          start: draft.start,
          end: draft.end,
          category: draft.category,
          notes: '',
          done: false,
          subjectId: draft.subjectId,
          examId: null,
        },
      })
      toast(t('agenda.createdBlock', { title: draft.title }), {
        actionLabel: t('common.undoDelete'),
        onAction: () => dispatch({ type: 'deleteBlock', id }),
      })
      onCreated(draft.date)
    }
    onClose()
  }

  const subject = draft?.subjectId ? state.subjects.find((s) => s.id === draft.subjectId) : null
  const when = draft ? (draft.kind === 'task' ? draft.dueDate : draft.date) : date
  const delta = diffDays(when, today)
  const whenLabel =
    delta === 0
      ? t('date.today')
      : delta === 1
        ? t('date.tomorrow')
        : `${weekdayShort(dayOfWeek(when))} ${formatShortDate(when)}`

  const chip = 'inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-xs font-medium text-ink-2'

  return (
    <Sheet open={open} onClose={onClose} label={t('agenda.quickLabel')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {t('agenda.quickTitle', { date: formatShortDate(date) })}
          </h2>
          {pressedMinutes !== null ? (
            <span className="tnum text-sm text-ink-3">
              {t('agenda.quickAt', { time: formatClock(clockFromMinutes(pressedMinutes)) })}
            </span>
          ) : null}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('agenda.quickPlaceholder')}
          aria-label={t('agenda.quickLabel')}
          autoComplete="off"
          autoFocus
          enterKeyHint="done"
          className="mt-3 h-12 w-full rounded-2xl border border-line-strong bg-surface-2 px-4 text-md text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--brand-ring)]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented
            size="sm"
            ariaLabel={t('agenda.kindLabel')}
            value={kind}
            onChange={setForce}
            options={[
              { value: 'task', label: t('agenda.kindTask') },
              { value: 'block', label: t('agenda.kindBlock') },
            ]}
          />

          {/* Lo que se ha entendido, antes de crear nada. */}
          {draft ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
              <span className={chip}>
                <CalendarDays size={12} />
                {whenLabel}
              </span>
              {draft.kind === 'block' ? (
                <span className={`${chip} tnum`}>
                  <Clock3 size={12} />
                  {formatClock(draft.start)}–{formatClock(draft.end)}
                </span>
              ) : draft.dueTime ? (
                <span className={`${chip} tnum`}>
                  <Clock3 size={12} />
                  {formatClock(draft.dueTime)}
                </span>
              ) : null}
              {subject ? <SubjectChip subject={subject} className="py-1" /> : null}
              {draft.kind === 'task' && draft.priority !== 'medium' ? (
                <span className={chip} style={{ color: colorVar(PRIORITIES[draft.priority].color) }}>
                  <Flag size={12} />
                  {t(PRIORITIES[draft.priority].labelKey)}
                </span>
              ) : null}
              {draft.kind === 'task' && draft.estimateMin ? (
                <span className={chip}>
                  <Timer size={12} />
                  {formatDuration(draft.estimateMin)}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <p className="mt-3 px-1 text-xs text-ink-3">{t('agenda.quickExample')}</p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => onMore({ kind, draft, date, pressedMinutes })}
          >
            {t('agenda.more')}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!draft}>
            {t('agenda.add')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
