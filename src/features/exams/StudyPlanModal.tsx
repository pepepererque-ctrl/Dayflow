import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import {
  clockFromMinutes,
  dayOfWeek,
  formatClock,
  formatDuration,
  formatShortDate,
  minutesFromClock,
  nowClock,
  weekdayShort,
} from '@/lib/date'
import { defaultStudyMinutes, planStudy, planSummary, type ExamEntry } from '@/lib/exams'
import { uid } from '@/lib/id'
import { subjectShort } from '@/lib/subjects'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { TimeBlock } from '@/types'

const SESSIONS = ['60', '90', '120']
const MAX_HOURS = 60

/**
 * Propone sesiones de estudio en los huecos libres de la agenda hasta el día
 * antes del examen. Nada se crea hasta pulsar «Crear plan».
 */
export function StudyPlanModal({ entry, onClose }: { entry: ExamEntry | null; onClose: () => void }) {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()

  const [hours, setHours] = useState('')
  const [session, setSession] = useState('90')
  const [weekends, setWeekends] = useState(true)

  // Cada vez que se abre con otro examen se vuelve a las horas sugeridas para él.
  useEffect(() => {
    if (!entry) return
    setHours(String(defaultStudyMinutes(entry.subject, entry.item) / 60))
    setSession('90')
    setWeekends(true)
  }, [entry])

  const nowMinutes = useMemo(() => minutesFromClock(nowClock()), [entry])

  const parsed = Number(hours.trim().replace(',', '.'))
  const totalMinutes =
    Number.isFinite(parsed) && parsed > 0 ? Math.min(MAX_HOURS * 60, Math.round((parsed * 60) / 15) * 15) : 0

  const result = useMemo(
    () =>
      entry && totalMinutes > 0
        ? planStudy(
            state,
            entry,
            { totalMinutes, sessionMinutes: Number(session), includeWeekends: weekends },
            today,
            nowMinutes,
          )
        : null,
    [entry, state, totalMinutes, session, weekends, today, nowMinutes],
  )

  if (!entry) return <Modal open={false} onClose={onClose} title="">{null}</Modal>

  const existing = planSummary(state.blocks, entry.item.id)

  const create = () => {
    if (!result || !result.proposals.length) return
    const title = t('studyPlan.blockTitle', { subject: subjectShort(entry.subject), exam: entry.item.name })
    const blocks: TimeBlock[] = result.proposals.map((p) => ({
      id: uid('blk'),
      title,
      date: p.date,
      start: clockFromMinutes(p.start),
      end: clockFromMinutes(p.end),
      category: 'study',
      notes: '',
      done: false,
      subjectId: entry.subject.id,
      examId: entry.item.id,
    }))
    dispatch({ type: 'applyStudyPlan', examId: entry.item.id, from: today, blocks })
    toast(t('studyPlan.created', { n: blocks.length }))
    onClose()
  }

  const remove = async () => {
    const ok = await confirm({
      title: t('studyPlan.removeTitle'),
      message: t('studyPlan.removeBody'),
      confirmLabel: t('studyPlan.remove'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteStudyPlan', examId: entry.item.id, from: today })
    toast(t('studyPlan.removed'), { tone: 'info' })
    onClose()
  }

  const canCreate = Boolean(result && result.proposals.length)

  return (
    <Modal
      open
      onClose={onClose}
      title={t('studyPlan.title')}
      description={t('studyPlan.sub', { name: `${entry.subject.name} · ${entry.item.name}`, date: formatShortDate(entry.date) })}
      footer={
        <>
          {existing.blocks > 0 ? (
            <>
              <Button variant="danger" size="sm" onClick={remove}>
                <Trash2 size={14} />
                {t('studyPlan.remove')}
              </Button>
              <div className="flex-1" />
            </>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={create} disabled={!canCreate}>
            {existing.blocks > 0 ? t('studyPlan.recreate') : t('studyPlan.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('studyPlan.hours')} htmlFor="plan-hours" hint={t('studyPlan.hoursHint')}>
            <TextInput
              id="plan-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="12"
            />
          </Field>
          <Field label={t('studyPlan.session')}>
            <Segmented
              ariaLabel={t('studyPlan.session')}
              value={session}
              onChange={setSession}
              options={SESSIONS.map((m) => ({ value: m, label: formatDuration(Number(m)) }))}
            />
          </Field>
        </div>

        <Checkbox checked={weekends} onChange={setWeekends} label={t('studyPlan.weekends')} />

        {existing.blocks > 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-ink-3" />
            {t('studyPlan.replaces')}
          </p>
        ) : null}

        <div aria-live="polite">
          {result && result.windowDays === 0 ? (
            <p className="text-sm font-medium text-bad">{t('studyPlan.noWindow')}</p>
          ) : result && result.proposals.length ? (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="eyebrow">{t('studyPlan.preview')}</p>
                <p className="tnum text-xs text-ink-3">
                  {t('studyPlan.summary', {
                    n: result.proposals.length,
                    duration: formatDuration(result.placedMinutes),
                  })}
                </p>
              </div>
              <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {result.proposals.map((p) => (
                  <li
                    key={`${p.date}-${p.start}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-ink">
                      <span className="inline-block w-9 text-ink-3 first-letter:uppercase">
                        {weekdayShort(dayOfWeek(p.date))}
                      </span>{' '}
                      {formatShortDate(p.date)}
                    </span>
                    <span className="tnum text-ink-2">
                      {formatClock(clockFromMinutes(p.start))} – {formatClock(clockFromMinutes(p.end))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {result && result.windowDays > 0 && result.shortfallMinutes > 0 ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-warn">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {t('studyPlan.shortfall', { duration: formatDuration(result.shortfallMinutes) })}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
