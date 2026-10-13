import { ClipboardCheck, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { clockFromMinutes, dayOfWeek, formatClock, weekdayShort } from '@/lib/date'
import type { AgendaItem } from '@/lib/agenda'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ISODate } from '@/types'
import { TaskCheckbox } from '../tasks/TaskRow'
import { toneColor } from './MonthView'

const time = (minutes: number) => formatClock(clockFromMinutes(minutes))

/**
 * Lo que hay el día elegido: número grande, día de la semana y la lista de
 * elementos con su hora. Las tareas y los bloques se marcan como hechos desde aquí.
 */
export function DayPanel({
  date,
  items,
  onOpen,
  onAdd,
}: {
  date: ISODate
  items: AgendaItem[]
  onOpen: (item: AgendaItem) => void
  onAdd: () => void
}) {
  const { dispatch } = useApp()
  const t = useT()

  return (
    <section aria-label={date} className="mt-6">
      <div className="flex items-baseline gap-3 px-1">
        <span className="tnum text-4xl font-semibold leading-none tracking-tight text-ink">
          {Number(date.slice(8, 10))}
        </span>
        <span className="text-sm font-semibold uppercase tracking-wide text-ink-2">
          {weekdayShort(dayOfWeek(date))}.
        </span>
        <span className="ml-auto text-xs text-ink-3">{items.length ? t('agenda.items', { n: items.length }) : null}</span>
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-9 text-center transition-colors hover:bg-surface-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
            <Plus size={18} />
          </span>
          <span className="text-sm font-medium text-ink-2">{t('agenda.empty')}</span>
          <span className="text-xs text-ink-3">{t('agenda.emptyHint')}</span>
        </button>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((item) => {
            const checkable = item.kind === 'task' || item.kind === 'block'
            const toggle = () =>
              item.kind === 'task'
                ? dispatch({ type: 'toggleTask', id: item.refId })
                : dispatch({ type: 'patchBlock', id: item.refId, patch: { done: !item.done } })

            return (
              <li key={item.id} className="flex items-stretch gap-1 rounded-2xl transition-colors hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex min-w-0 flex-1 items-stretch gap-3 rounded-2xl px-3 py-2.5 text-left"
                >
                  <span className="tnum w-[3.1rem] shrink-0 text-right text-xs leading-tight text-ink-3">
                    {item.start === null ? (
                      <span className="text-2xs uppercase tracking-wide">{t('agenda.allDay')}</span>
                    ) : (
                      <>
                        <span className="block text-sm font-semibold text-ink-2">{time(item.start)}</span>
                        {item.end !== null && item.kind !== 'task' ? (
                          <span className="block">{time(item.end)}</span>
                        ) : null}
                      </>
                    )}
                  </span>
                  <span
                    className="w-1 shrink-0 self-stretch rounded-full"
                    style={{ background: toneColor(item.tone), opacity: item.done ? 0.4 : 1 }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {item.kind === 'exam' ? (
                        <ClipboardCheck size={14} className="shrink-0 text-bad" aria-label={t('agenda.examBadge')} />
                      ) : null}
                      <span
                        className={cn(
                          'truncate text-base font-medium',
                          item.done ? 'text-ink-3 line-through' : 'text-ink',
                        )}
                      >
                        {item.title}
                      </span>
                    </span>
                    {item.detail ? <span className="block truncate text-xs text-ink-3">{item.detail}</span> : null}
                  </span>
                </button>
                {checkable ? (
                  <span className="flex items-center pr-3">
                    <TaskCheckbox
                      done={item.done}
                      onToggle={toggle}
                      label={
                        item.done
                          ? t('agenda.reopenBlock', { title: item.title })
                          : t('agenda.completeBlock', { title: item.title })
                      }
                    />
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
