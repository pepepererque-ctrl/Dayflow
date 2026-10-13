import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { habitDoneOn, habitDueOn } from '@/lib/analytics'
import { addDays, dayOfWeek, formatShortDate, startOfWeek, weekDates, weekdayNarrow } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import type { Habit, ISODate } from '@/types'

/** Seven tappable day cells for the week containing `anchor`. */
export function HabitWeekRow({
  habit,
  anchor,
  today,
  weekStartsOn,
  onToggle,
  size = 32,
  showLetters = true,
}: {
  habit: Habit
  anchor: ISODate
  today: ISODate
  weekStartsOn: 0 | 1
  onToggle: (date: ISODate) => void
  size?: number
  showLetters?: boolean
}) {
  const t = useT()
  const dates = weekDates(anchor, weekStartsOn)
  const tint = colorVar(habit.color)

  return (
    <div className="flex items-end gap-1.5">
      {dates.map((date) => {
        const due = habitDueOn(habit, date)
        const done = habitDoneOn(habit, date)
        const future = date > today
        const isToday = date === today

        return (
          <div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {showLetters ? (
              <span className={cn('text-2xs font-medium', isToday ? 'text-ink' : 'text-ink-3')}>
                {weekdayNarrow(dayOfWeek(date))}
              </span>
            ) : null}
            <button
              type="button"
              disabled={future || !due}
              onClick={() => onToggle(date)}
              aria-pressed={done}
              aria-label={t('habits.cellOn', { name: habit.name, date: formatShortDate(date) })}
              title={
                !due
                  ? t('habits.cellNotScheduled')
                  : future
                    ? t('habits.cellFuture')
                    : done
                      ? t('habits.cellDone')
                      : t('habits.cellMark')
              }
              style={{
                // Width is capped rather than fixed so a row of seven can shrink
                // into a narrow card instead of forcing the card wider.
                maxWidth: size,
                height: size,
                background: done ? tint : undefined,
                borderColor: done ? tint : isToday ? 'var(--ink-3)' : undefined,
              }}
              className={cn(
                'flex w-full items-center justify-center rounded-[10px] border transition-all duration-150',
                done
                  ? 'text-white'
                  : due && !future
                    ? 'border-line-strong text-transparent hover:border-ink-3 hover:bg-surface-2'
                    : 'border-dashed border-line text-transparent',
                (future || !due) && 'cursor-default opacity-55',
              )}
            >
              <Check size={size * 0.5} strokeWidth={3} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Contribution-style grid: one column per week, one row per weekday. */
export function HabitHeatmap({
  habit,
  weeks = 14,
  today,
  weekStartsOn,
}: {
  habit: Habit
  weeks?: number
  today: ISODate
  weekStartsOn: 0 | 1
}) {
  const t = useT()
  const firstWeek = startOfWeek(addDays(today, -(weeks - 1) * 7), weekStartsOn)
  const columns = Array.from({ length: weeks }, (_, w) => weekDates(addDays(firstWeek, w * 7), weekStartsOn))
  const tint = colorVar(habit.color)

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1 no-scrollbar">
      {columns.map((week) => (
        <div key={week[0]} className="flex flex-col gap-[3px]">
          {week.map((date) => {
            const due = habitDueOn(habit, date)
            const done = habitDoneOn(habit, date)
            const future = date > today
            return (
              <div
                key={date}
                title={`${formatShortDate(date)} - ${
                  !due
                    ? t('habits.cellNotScheduled')
                    : done
                      ? t('habits.done')
                      : future
                        ? t('habits.cellUpcoming')
                        : t('habits.cellMissed')
                }`}
                className={cn(
                  'h-[13px] w-[13px] rounded-[3.5px]',
                  !done && (due && !future ? 'bg-surface-3' : 'bg-surface-2'),
                )}
                style={done ? { background: tint } : undefined}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function StreakFlame({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="tnum text-xl font-semibold leading-[1.1] tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-2xs text-ink-3">{label}</p>
    </div>
  )
}
