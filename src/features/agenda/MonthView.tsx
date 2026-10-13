import { useRef } from 'react'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { dayOfWeek, formatFullDate, weekdayShort } from '@/lib/date'
import { dayBars, type AgendaItem, type AgendaTone } from '@/lib/agenda'
import { useT } from '@/i18n/I18nProvider'
import type { ISODate } from '@/types'

/** Los exámenes son siempre rojos; el resto toma el color de su asignatura o categoría. */
export const toneColor = (tone: AgendaTone): string => (tone === 'exam' ? 'var(--bad)' : colorVar(tone))

/** Lo mínimo que hay que arrastrar en horizontal para contar como «cambiar de mes». */
const SWIPE_MIN = 56

/**
 * El mes como una cuadrícula de cuadraditos: cada día con eventos se tiñe del
 * color del más importante y lleva una barra por elemento (hasta tres), sin texto.
 * El detalle de cada día está en el panel de debajo.
 */
export function MonthView({
  weeks,
  month,
  selected,
  today,
  weekStartsOn,
  agenda,
  direction,
  onSelect,
  onSwipe,
}: {
  weeks: ISODate[][]
  /** Mes que se muestra (`AAAA-MM`); los días de otros meses salen atenuados. */
  month: string
  selected: ISODate
  today: ISODate
  weekStartsOn: 0 | 1
  agenda: Map<ISODate, AgendaItem[]>
  /** Hacia dónde se ha movido por última vez, para animar la entrada. */
  direction: 1 | -1
  onSelect: (date: ISODate) => void
  /** +1 = mes siguiente, -1 = anterior. */
  onSwipe: (delta: 1 | -1) => void
}) {
  const t = useT()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const header = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)

  return (
    <div
      // Deslizar en horizontal cambia de mes; en vertical sigue desplazando la página.
      className="touch-pan-y select-none"
      onTouchStart={(e) => {
        const p = e.touches[0]
        touch.current = { x: p.clientX, y: p.clientY }
      }}
      onTouchEnd={(e) => {
        const start = touch.current
        touch.current = null
        if (!start) return
        const p = e.changedTouches[0]
        const dx = p.clientX - start.x
        const dy = p.clientY - start.y
        if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
      }}
    >
      <div className="mb-2 grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {header.map((dow) => (
          <span
            key={dow}
            className={cn('eyebrow py-1.5 !tracking-[0.04em]', dow === 0 && '!text-bad')}
          >
            {weekdayShort(dow)}
          </span>
        ))}
      </div>

      <div
        key={month}
        className={cn(
          'grid grid-cols-7 gap-1',
          direction === 1 ? 'animate-[agenda-in-next_0.22s_ease-out]' : 'animate-[agenda-in-prev_0.22s_ease-out]',
        )}
      >
        {weeks.flat().map((date) => {
          const items = agenda.get(date) ?? []
          const bars = dayBars(items)
          const inMonth = date.startsWith(month)
          const isToday = date === today
          const isSelected = date === selected
          const sunday = dayOfWeek(date) === 0
          const tint = bars.length
            ? `color-mix(in srgb, ${toneColor(bars[0])} 17%, var(--surface-2))`
            : 'var(--surface-2)'

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={t('agenda.dayCell', { date: formatFullDate(date), n: items.length })}
              className={cn(
                'relative flex min-h-[66px] flex-col rounded-xl px-0.5 pb-2 pt-1.5 transition-[box-shadow,opacity] duration-150 sm:min-h-[86px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]',
                isSelected && 'ring-1 ring-ink-3',
                !inMonth && 'opacity-45',
              )}
              style={{ background: tint }}
            >
              <span
                className={cn(
                  'tnum mx-auto flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-base font-semibold',
                  isToday ? 'bg-ink text-surface' : sunday ? 'text-bad' : 'text-ink',
                )}
              >
                {Number(date.slice(8, 10))}
              </span>
              {bars.length ? (
                <span className="mt-2 flex flex-col gap-[5px] px-1.5" aria-hidden="true">
                  {bars.map((tone, i) => (
                    <span key={i} className="h-[7px] rounded-full" style={{ background: toneColor(tone) }} />
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
