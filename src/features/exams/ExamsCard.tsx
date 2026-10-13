import { useMemo } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatClock } from '@/lib/date'
import { listExams } from '@/lib/exams'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import { SubjectChip } from '../subjects/SubjectBits'
import { CountTile, useExamWhen } from './examBits'

/** Cuántos días vista cuenta como «próximo» en la pantalla de Hoy. */
const HORIZON_DAYS = 30

/**
 * Resumen de exámenes para Hoy. No aparece si no hay ninguno cerca, para no
 * dejar un hueco vacío en la rejilla.
 */
export function ExamsCard() {
  const { state, today } = useApp()
  const t = useT()
  const when = useExamWhen()

  const soon = useMemo(
    () =>
      listExams(state.subjects, today)
        .upcoming.filter((e) => e.days <= HORIZON_DAYS)
        .slice(0, 3),
    [state.subjects, today],
  )
  if (!soon.length) return null

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('exams.todayTitle')}
        icon={<ClipboardCheck size={16} />}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('exams')}>
            {t('exams.seeAll')}
          </Button>
        }
      />
      <ul className="flex-1 space-y-1 p-3 pt-2">
        {soon.map((entry) => (
          <li key={entry.item.id}>
            <button
              type="button"
              onClick={() => navigate('exams')}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <CountTile days={entry.days} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{entry.item.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
                  <SubjectChip subject={entry.subject} />
                  <span>
                    {when(entry.days)}
                    {entry.item.time ? ` · ${formatClock(entry.item.time)}` : ''}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
