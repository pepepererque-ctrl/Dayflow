import { useCallback } from 'react'
import { cn } from '@/lib/cn'
import { useT } from '@/i18n/I18nProvider'

/** Cuenta atrás en palabras: «Hoy», «Mañana», «En 5 días». */
export function useExamWhen() {
  const t = useT()
  return useCallback(
    (days: number) =>
      days <= 0 ? t('exams.today') : days === 1 ? t('exams.tomorrow') : t('exams.inDays', { n: days }),
    [t],
  )
}

/** Cuanto más cerca, más aviso: rojo a 2 días o menos, ámbar a una semana. */
function toneClass(days: number): string {
  if (days <= 2) return 'bg-bad/10 text-bad'
  if (days <= 7) return 'bg-warn/10 text-warn'
  return 'bg-surface-2 text-ink'
}

/** Cuadrado con los días que faltan. */
export function CountTile({ days, size = 64 }: { days: number; size?: number }) {
  const t = useT()
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-2xl',
        toneClass(days),
      )}
      style={{ width: size, height: size }}
    >
      {days <= 0 ? (
        <span className="text-sm font-semibold uppercase tracking-wide">{t('exams.bigToday')}</span>
      ) : (
        <>
          <span
            className="tnum font-semibold leading-none tracking-tight"
            style={{ fontSize: size * 0.4 }}
          >
            {days}
          </span>
          <span className="mt-0.5 text-2xs font-medium opacity-80">{t('exams.bigDays', { n: days })}</span>
        </>
      )}
    </div>
  )
}
