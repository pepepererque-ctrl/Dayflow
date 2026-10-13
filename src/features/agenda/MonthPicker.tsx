import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { monthShort } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import type { ISODate } from '@/types'

/** Hoja con el año y los doce meses como botones redondos. */
export function MonthPicker({
  open,
  onClose,
  current,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** Fecha que se está viendo; su mes sale resaltado. */
  current: ISODate
  /** Se llama con el año y el mes (0-11) elegidos. */
  onPick: (year: number, month: number) => void
}) {
  const t = useT()
  const [year, setYear] = useState(Number(current.slice(0, 4)))
  const currentYear = Number(current.slice(0, 4))
  const currentMonth = Number(current.slice(5, 7)) - 1

  // Al abrirla se parte siempre del año que se está viendo.
  useEffect(() => {
    if (open) setYear(Number(current.slice(0, 4)))
  }, [open, current])

  const arrow =
    'flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink'

  return (
    <Sheet open={open} onClose={onClose} label={t('agenda.pickMonth')}>
      <div className="flex items-center justify-between">
        <button type="button" className={arrow} onClick={() => setYear((y) => y - 1)} aria-label={t('agenda.prevYear')}>
          <ChevronLeft size={20} />
        </button>
        <p className="tnum text-lg font-semibold text-ink" aria-live="polite">
          {year}
        </p>
        <button type="button" className={arrow} onClick={() => setYear((y) => y + 1)} aria-label={t('agenda.nextYear')}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 justify-items-center gap-x-2 gap-y-3 pb-1">
        {Array.from({ length: 12 }, (_, month) => {
          const active = year === currentYear && month === currentMonth
          return (
            <button
              key={month}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(year, month)}
              className={cn(
                'flex h-[62px] w-[62px] items-center justify-center rounded-full text-sm font-semibold transition-colors',
                active ? 'bg-ink text-surface' : 'bg-surface-3 text-ink-2 hover:text-ink',
              )}
            >
              {monthShort(month)}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
