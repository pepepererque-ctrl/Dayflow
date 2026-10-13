import { useMemo, useState } from 'react'
import { CalendarOff, CalendarDays, GraduationCap, Info, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { CLASS_KINDS, colorVar } from '@/lib/constants'
import {
  clockFromMinutes,
  dayOfWeek,
  formatClock,
  formatDuration,
  minutesFromClock,
  weekdayLong,
  weekdayShort,
} from '@/lib/date'
import { navigate } from '@/lib/router'
import { isOpenSubject, subjectShort } from '@/lib/subjects'
import { breakOn, isTeachingDate, layoutLanes, weeklyClassMinutes } from '@/lib/timetable'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ClassSlot, Subject } from '@/types'
import { SubjectChip } from '../subjects/SubjectBits'
import { SlotEditor } from './SlotEditor'
import { TermEditor } from './TermEditor'

const HOUR_H = 52
const GUTTER = 52

type View = 'week' | 'list'

interface Placed {
  slot: ClassSlot
  subject: Subject
  start: number
  end: number
}

export function TimetablePage() {
  const { state, today } = useApp()
  const t = useT()

  // Siete columnas no caben en un móvil: allí se empieza en la lista.
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'week',
  )
  const [editing, setEditing] = useState<ClassSlot | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [defaults, setDefaults] = useState<{ weekday?: number; start?: string } | undefined>()
  const [termOpen, setTermOpen] = useState(false)

  const subjectsById = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects])
  const hasOpenSubjects = state.subjects.some(isOpenSubject)

  // Las clases de asignaturas ya cerradas dejan de verse, pero siguen guardadas.
  const placed: Placed[] = useMemo(
    () =>
      state.timetable.slots.flatMap((slot) => {
        const subject = subjectsById.get(slot.subjectId)
        if (!subject || !isOpenSubject(subject)) return []
        return [{ slot, subject, start: minutesFromClock(slot.start), end: minutesFromClock(slot.end) }]
      }),
    [state.timetable.slots, subjectsById],
  )

  const weekOrder = state.settings.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
  // De lunes a viernes siempre; sábado y domingo solo si hay algo.
  const shown = weekOrder.filter((d) => (d >= 1 && d <= 5) || placed.some((p) => p.slot.weekday === d))

  const startHour = Math.min(8, Math.floor(Math.min(...placed.map((p) => p.start), 8 * 60) / 60))
  const endHour = Math.max(20, Math.ceil(Math.max(...placed.map((p) => p.end), 20 * 60) / 60))
  const gridHeight = (endHour - startHour) * HOUR_H

  const openNew = (weekday?: number, startMin?: number) => {
    setEditing(null)
    setDefaults({ weekday, start: startMin === undefined ? undefined : clockFromMinutes(startMin) })
    setEditorOpen(true)
  }
  const openExisting = (slot: ClassSlot) => {
    setEditing(slot)
    setDefaults(undefined)
    setEditorOpen(true)
  }

  const teachingToday = isTeachingDate(state.timetable, today)
  const todayBreak = breakOn(state.timetable, today)
  const todayDow = dayOfWeek(today)

  const addButton = (
    <Button variant="primary" onClick={() => openNew()} disabled={!hasOpenSubjects}>
      <Plus size={16} />
      {t('timetable.add')}
    </Button>
  )

  return (
    <>
      <PageHeader
        title={t('timetable.title')}
        subtitle={
          placed.length
            ? t('timetable.subtitle', {
                n: placed.length,
                duration: formatDuration(weeklyClassMinutes(state)),
              })
            : t('timetable.subtitleEmpty')
        }
        actions={
          <>
            {placed.length ? (
              <Segmented
                ariaLabel={t('timetable.viewLabel')}
                value={view}
                onChange={setView}
                options={[
                  { value: 'week', label: t('timetable.week') },
                  { value: 'list', label: t('timetable.list') },
                ]}
              />
            ) : null}
            <Button variant="secondary" onClick={() => setTermOpen(true)}>
              <CalendarOff size={15} />
              {t('timetable.term')}
            </Button>
            {addButton}
          </>
        }
      />

      {!teachingToday && placed.length ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-ink-3">
          <Info size={14} className="shrink-0" />
          {todayBreak !== null ? t('timetable.breakToday', { label: todayBreak }) : t('timetable.outsideTerm')}
        </p>
      ) : null}

      {!hasOpenSubjects ? (
        <Card>
          <EmptyState
            icon={<GraduationCap size={22} />}
            title={t('timetable.noSubjectsTitle')}
            description={t('timetable.noSubjectsBody')}
            action={
              <Button variant="primary" onClick={() => navigate('subjects')}>
                {t('timetable.goToSubjects')}
              </Button>
            }
          />
        </Card>
      ) : placed.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={t('timetable.emptyTitle')}
            description={t('timetable.emptyBody')}
            action={addButton}
          />
        </Card>
      ) : view === 'week' ? (
        /* ------------------------------ semana ------------------------------ */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className="grid border-b border-line bg-surface"
                style={{ gridTemplateColumns: `${GUTTER}px repeat(${shown.length}, minmax(0, 1fr))` }}
              >
                <div />
                {shown.map((dow) => (
                  <div
                    key={dow}
                    className="flex flex-col items-center gap-0.5 border-l border-line py-2.5"
                  >
                    <span
                      className={cn(
                        'eyebrow',
                        dow === todayDow && teachingToday && 'text-brand-ink',
                      )}
                    >
                      {weekdayShort(dow)}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `${GUTTER}px repeat(${shown.length}, minmax(0, 1fr))`,
                  height: gridHeight,
                }}
              >
                <div className="relative">
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <div
                      key={i}
                      className="absolute right-2 -translate-y-1/2 text-2xs tabular-nums text-ink-3"
                      style={{ top: i * HOUR_H }}
                    >
                      {i === 0 ? '' : formatClock(clockFromMinutes((startHour + i) * 60))}
                    </div>
                  ))}
                </div>

                {shown.map((dow) => {
                  const lanes = layoutLanes(placed.filter((p) => p.slot.weekday === dow))
                  return (
                    <div key={dow} className="relative border-l border-line">
                      {Array.from({ length: endHour - startHour }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openNew(dow, (startHour + i) * 60)}
                          aria-label={t('timetable.addAt', {
                            day: weekdayLong(dow),
                            time: formatClock(clockFromMinutes((startHour + i) * 60)),
                          })}
                          className="absolute inset-x-0 border-t border-line transition-colors hover:bg-brand-soft/40"
                          style={{ top: i * HOUR_H, height: HOUR_H }}
                        />
                      ))}

                      {lanes.map((p) => {
                        const tint = colorVar(p.subject.color)
                        const top = ((p.start - startHour * 60) / 60) * HOUR_H
                        const height = Math.max(24, ((p.end - p.start) / 60) * HOUR_H - 2)
                        const roomy = height >= 56
                        return (
                          <button
                            key={p.slot.id}
                            type="button"
                            onClick={() => openExisting(p.slot)}
                            title={`${p.subject.name} · ${formatClock(p.slot.start)}-${formatClock(p.slot.end)}`}
                            className="absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-shadow hover:shadow-pop"
                            style={{
                              top,
                              height,
                              left: `calc(${(p.lane / p.lanes) * 100}% + 3px)`,
                              width: `calc(${100 / p.lanes}% - 6px)`,
                              borderLeftColor: tint,
                              background: `color-mix(in srgb, ${tint} 14%, var(--surface))`,
                            }}
                          >
                            <p className="truncate text-xs font-semibold leading-tight text-ink">
                              {roomy ? p.subject.name : subjectShort(p.subject)}
                            </p>
                            <p className="tnum truncate text-2xs leading-tight text-ink-3">
                              {formatClock(p.slot.start)}–{formatClock(p.slot.end)}
                            </p>
                            {roomy ? (
                              <p className="truncate text-2xs leading-tight text-ink-3">
                                {[t(CLASS_KINDS[p.slot.kind].labelKey), p.slot.room].filter(Boolean).join(' · ')}
                              </p>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* ------------------------------- lista ------------------------------ */
        <div className="space-y-4">
          {shown.map((dow) => {
            const day = placed
              .filter((p) => p.slot.weekday === dow)
              .sort((a, b) => a.start - b.start || a.end - b.end)
            return (
              <Card key={dow}>
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <h2
                    className={cn(
                      'text-sm font-semibold first-letter:uppercase',
                      dow === todayDow && teachingToday ? 'text-brand-ink' : 'text-ink',
                    )}
                  >
                    {weekdayLong(dow)}
                  </h2>
                  <Button size="sm" variant="ghost" onClick={() => openNew(dow)} disabled={!hasOpenSubjects}>
                    <Plus size={14} />
                    {t('common.add')}
                  </Button>
                </div>
                {day.length ? (
                  <ul className="p-1.5">
                    {day.map((p) => (
                      <li key={p.slot.id}>
                        <button
                          type="button"
                          onClick={() => openExisting(p.slot)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="tnum w-[7.5rem] shrink-0 text-sm font-semibold text-ink-2">
                            {formatClock(p.slot.start)} – {formatClock(p.slot.end)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <SubjectChip subject={p.subject} full />
                            <span className="mt-0.5 block truncate text-xs text-ink-3">
                              {[t(CLASS_KINDS[p.slot.kind].labelKey), p.slot.room].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-sm text-ink-3">{t('timetable.noClasses')}</p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <SlotEditor open={editorOpen} onClose={() => setEditorOpen(false)} slot={editing} defaults={defaults} />
      <TermEditor open={termOpen} onClose={() => setTermOpen(false)} />
    </>
  )
}
