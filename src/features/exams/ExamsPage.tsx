import { useMemo, useState } from 'react'
import { CalendarClock, ClipboardCheck, GraduationCap, MapPin, Wand2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatClock, formatDuration, formatFullDate, formatShortDate } from '@/lib/date'
import { listExams, planSummary, type ExamEntry } from '@/lib/exams'
import { formatGrade } from '@/lib/grades'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import { SubjectChip } from '../subjects/SubjectBits'
import { CountTile, useExamWhen } from './examBits'
import { StudyPlanModal } from './StudyPlanModal'

/** Hora, aula y peso en una sola línea de detalles. */
function ExamFacts({ entry }: { entry: ExamEntry }) {
  const t = useT()
  const { item } = entry
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock size={14} />
        <span className="first-letter:uppercase">{formatFullDate(entry.date)}</span>
        {item.time ? <span>· {t('exams.at', { time: formatClock(item.time) })}</span> : null}
      </span>
      {item.room ? (
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} />
          {t('exams.room', { room: item.room })}
        </span>
      ) : null}
      <span className="tnum">{t('exams.weight', { n: formatGrade(item.weight) })}</span>
    </p>
  )
}

function PlanLine({ entry }: { entry: ExamEntry }) {
  const { state } = useApp()
  const t = useT()
  const plan = planSummary(state.blocks, entry.item.id)
  if (!plan.blocks) return <span className="text-ink-3">{t('exams.planNone')}</span>
  return (
    <span className="tnum text-ink-2">
      {t('exams.planSummary', { blocks: plan.blocks, duration: formatDuration(plan.minutes) })}
      {plan.doneBlocks ? <span className="text-ink-3"> · {t('exams.planDone', { n: plan.doneBlocks })}</span> : null}
    </span>
  )
}

function ExamCard({
  entry,
  featured,
  onPlan,
}: {
  entry: ExamEntry
  featured?: boolean
  onPlan: (entry: ExamEntry) => void
}) {
  const { state } = useApp()
  const t = useT()
  const when = useExamWhen()
  const hasPlan = planSummary(state.blocks, entry.item.id).blocks > 0

  return (
    <Card className={cn(featured && 'relative overflow-hidden')}>
      <div className={cn('flex gap-4', featured ? 'p-5 sm:p-6' : 'p-4')}>
        <CountTile days={entry.days} size={featured ? 84 : 60} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SubjectChip subject={entry.subject} full />
            <span className="text-xs font-medium text-ink-3">{when(entry.days)}</span>
          </div>
          <h3
            className={cn(
              'font-semibold leading-snug tracking-[-0.015em] text-ink',
              featured ? 'text-xl sm:text-2xl' : 'text-md',
            )}
          >
            {entry.item.name}
          </h3>
          <div className="mt-1.5">
            <ExamFacts entry={entry} />
          </div>
          <p className="mt-2.5 text-sm">
            <PlanLine entry={entry} />
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button size="sm" variant={hasPlan ? 'secondary' : 'primary'} onClick={() => onPlan(entry)}>
              <Wand2 size={14} />
              {hasPlan ? t('exams.planEdit') : t('exams.planButton')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(`subjects/${entry.subject.id}`)}>
              {t('exams.viewSubject')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ExamsPage() {
  const { state, today } = useApp()
  const t = useT()
  const when = useExamWhen()
  const [planFor, setPlanFor] = useState<ExamEntry | null>(null)

  const { upcoming, past } = useMemo(() => listExams(state.subjects, today), [state.subjects, today])
  const [first, ...rest] = upcoming

  return (
    <>
      <PageHeader
        title={t('exams.title')}
        subtitle={
          first
            ? t('exams.subtitle', { n: upcoming.length, first: when(first.days).toLowerCase() })
            : t('exams.subtitleEmpty')
        }
      />

      {!first ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title={t('exams.emptyTitle')}
            description={t('exams.emptyBody')}
            action={
              <Button variant="secondary" onClick={() => navigate('subjects')}>
                <GraduationCap size={15} />
                {t('exams.goToSubjects')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="eyebrow mb-3 px-1">{t('exams.next')}</h2>
            <ExamCard entry={first} featured onPlan={setPlanFor} />
          </section>

          {rest.length ? (
            <section>
              <h2 className="eyebrow mb-3 px-1">{t('exams.later')}</h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {rest.map((entry) => (
                  <ExamCard key={entry.item.id} entry={entry} onPlan={setPlanFor} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {past.length ? (
        <section className="mt-8">
          <h2 className="eyebrow mb-3 px-1">{t('exams.past')}</h2>
          <Card>
            <ul className="divide-y divide-line">
              {past.map((entry) => (
                <li key={entry.item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`subjects/${entry.subject.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-ink">{entry.item.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                        <SubjectChip subject={entry.subject} />
                        <span>{formatShortDate(entry.date)}</span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        'tnum shrink-0 text-sm font-semibold',
                        entry.item.grade === null ? 'font-normal text-ink-3' : 'text-ink',
                      )}
                    >
                      {entry.item.grade === null
                        ? t('exams.noGrade')
                        : t('exams.gradeOf', { grade: formatGrade(entry.item.grade) })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <StudyPlanModal entry={planFor} onClose={() => setPlanFor(null)} />
    </>
  )
}
