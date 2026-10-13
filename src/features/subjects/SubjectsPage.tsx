import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ExternalLink,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Timer,
  Trash2,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { CLASS_KINDS, SUBJECT_STATUSES, colorVar } from '@/lib/constants'
import { formatClock, formatDuration, formatShortDate, minutesFromClock, weekdayShort } from '@/lib/date'
import { computeGrades, formatGrade, weightedAverage } from '@/lib/grades'
import { navigate } from '@/lib/router'
import {
  activeCredits,
  formatCredits,
  isOpenSubject,
  subjectStats,
  type SubjectStats,
} from '@/lib/subjects'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import type { Subject, Task } from '@/types'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'
import { TaskRow } from '../tasks/TaskRow'
import { EvaluationCard } from './EvaluationCard'
import { SubjectEditor } from './SubjectEditor'
import { SubjectMark } from './SubjectBits'

type Tab = 'open' | 'closed' | 'all'

function SubjectCard({
  subject,
  stats,
  today,
}: {
  subject: Subject
  stats: SubjectStats
  today: string
}) {
  const t = useT()
  const relDay = useRelativeDay()
  const next = stats.nextDue
  const closed = !isOpenSubject(subject)
  const grades = computeGrades(subject)
  const shownGrade = grades.final ?? grades.average

  return (
    <Card className="overflow-hidden transition-shadow duration-200 hover:shadow-pop">
      <button
        type="button"
        onClick={() => navigate(`subjects/${subject.id}`)}
        className="flex w-full flex-col gap-4 p-4 text-left sm:p-5"
      >
        <div className="flex items-start gap-3.5">
          <SubjectMark subject={subject} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-md font-semibold leading-snug tracking-[-0.01em] text-ink">
              {subject.name}
            </h3>
            <p className="mt-0.5 truncate text-sm text-ink-3">
              {[subject.term, subject.credits ? t('subjects.credits', { n: formatCredits(subject.credits) }) : '']
                .filter(Boolean)
                .join(' · ') || subject.professor || '—'}
            </p>
          </div>
          {subject.status !== 'active' || shownGrade !== null ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {subject.status !== 'active' ? (
                <Badge color={SUBJECT_STATUSES[subject.status].color}>
                  {t(SUBJECT_STATUSES[subject.status].labelKey)}
                </Badge>
              ) : null}
              {shownGrade !== null ? (
                <p className="text-right">
                  <span className="tnum block text-lg font-semibold leading-none text-ink">
                    {formatGrade(shownGrade)}
                  </span>
                  <span className="mt-1 block text-2xs text-ink-3">
                    {grades.final !== null ? t('subjects.gradeFinal') : t('subjects.gradeCurrent')}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {!closed ? (
          <div className="space-y-1.5 border-t border-line pt-3 text-sm">
            <p className="flex items-center gap-2 text-ink-2">
              <CalendarClock size={14} className="shrink-0 text-ink-3" />
              {next ? (
                <span className="min-w-0 truncate">
                  <span className={cn(stats.overdue && 'font-medium text-bad')}>
                    {relDay(next.dueDate as string, today)}
                  </span>
                  <span className="text-ink-3"> · {next.title}</span>
                </span>
              ) : (
                <span className="text-ink-3">{t('subjects.noOpenTasks')}</span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className="tnum">{t('subjects.openTasks', { n: stats.openTasks.length })}</span>
              {stats.overdue ? (
                <span className="tnum font-medium text-bad">
                  {t('subjects.overdueCount', { n: stats.overdue })}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Timer size={12} />
                {stats.minutesWeek
                  ? t('subjects.studiedWeek', { duration: formatDuration(stats.minutesWeek) })
                  : t('subjects.noStudyWeek')}
              </span>
            </p>
          </div>
        ) : null}
      </button>
    </Card>
  )
}

export function SubjectsPage() {
  const { state, today } = useApp()
  const t = useT()
  const [tab, setTab] = useState<Tab>('open')
  const [editorOpen, setEditorOpen] = useState(false)

  const open = state.subjects.filter(isOpenSubject)
  const closedCount = state.subjects.length - open.length

  const rows = useMemo(
    () =>
      state.subjects.map((subject) => ({
        subject,
        stats: subjectStats(state, subject.id, today),
      })),
    [state, today],
  )

  const visible = rows.filter(({ subject }) =>
    tab === 'all' ? true : tab === 'open' ? isOpenSubject(subject) : !isOpenSubject(subject),
  )

  // Si hay varios periodos, se agrupan; con uno solo el encabezado sobra.
  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const row of visible) {
      const key = row.subject.term
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return [...map.entries()]
  }, [visible])
  const grouped = groups.length > 1

  const openTaskCount = rows
    .filter(({ subject }) => isOpenSubject(subject))
    .reduce((sum, { stats }) => sum + stats.openTasks.length, 0)
  const weekMinutes = rows.reduce((sum, { stats }) => sum + stats.minutesWeek, 0)

  const empty = state.subjects.length === 0
  const gpa = useMemo(() => weightedAverage(state.subjects), [state.subjects])

  return (
    <>
      <PageHeader
        title={t('subjects.title')}
        subtitle={
          empty
            ? t('subjects.subtitleEmpty')
            : t('subjects.subtitle', {
              active: open.length,
              credits: formatCredits(activeCredits(state.subjects)),
            })
        }
        actions={
          <Button variant="primary" onClick={() => setEditorOpen(true)}>
            <Plus size={16} />
            {t('subjects.new')}
          </Button>
        }
      />

      {empty ? (
        <Card>
          <EmptyState
            icon={<GraduationCap size={22} />}
            title={t('subjects.emptyTitle')}
            description={t('subjects.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setEditorOpen(true)}>
                <Plus size={15} />
                {t('subjects.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-5 overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              {[
                { label: t('subjects.statCredits'), value: formatCredits(activeCredits(state.subjects)) },
                { label: t('subjects.statOpen'), value: String(openTaskCount) },
                { label: t('subjects.statWeek'), value: weekMinutes ? formatDuration(weekMinutes) : '0m' },
                {
                  label: t('subjects.statGpa'),
                  value: gpa ? formatGrade(gpa.value) : '—',
                  title: gpa ? t('subjects.statGpaHint', { n: gpa.count }) : undefined,
                },
              ].map((stat) => (
                <div key={stat.label} title={stat.title} className="bg-surface px-4 py-3.5 sm:px-5">
                  <p className="eyebrow truncate">{stat.label}</p>
                  <p className="tnum mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="mb-5">
            <Segmented
              ariaLabel={t('subjects.filterLabel')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'open', label: t('subjects.tabActive', { n: open.length }) },
                { value: 'closed', label: t('subjects.tabClosed', { n: closedCount }) },
                { value: 'all', label: t('subjects.tabAll') },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<GraduationCap size={22} />}
                title={t('subjects.emptyFiltered', {
                  tab: tab === 'open' ? t('subjects.statusActive') : t('subjects.tabClosed', { n: closedCount }),
                })}
                description={t('subjects.emptyFilteredBody')}
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {groups.map(([term, items]) => (
                <section key={term || 'none'}>
                  {grouped ? <h2 className="eyebrow mb-3 px-1">{term || '—'}</h2> : null}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map(({ subject, stats }) => (
                      <SubjectCard key={subject.id} subject={subject} stats={stats} today={today} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <SubjectEditor open={editorOpen} onClose={() => setEditorOpen(false)} subject={null} />
    </>
  )
}

/* ------------------------------ detail screen ----------------------------- */

export function SubjectDetailPage({ subjectId }: { subjectId: string }) {
  const { state, dispatch, today } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()
  const relDay = useRelativeDay()
  const [editorOpen, setEditorOpen] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)

  const subject = state.subjects.find((s) => s.id === subjectId)

  if (!subject) {
    return (
      <Card>
        <EmptyState
          icon={<GraduationCap size={22} />}
          title={t('subjects.notFoundTitle')}
          description={t('subjects.notFoundBody')}
          action={
            <Button variant="secondary" onClick={() => navigate('subjects')}>
              {t('subjects.back')}
            </Button>
          }
        />
      </Card>
    )
  }

  const tint = colorVar(subject.color)
  const stats = subjectStats(state, subject.id, today)
  const grades = computeGrades(subject)
  const shownGrade = grades.final ?? grades.average
  const tasks = state.tasks
    .filter((x) => x.subjectId === subject.id)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
  const upcomingBlocks = state.blocks
    .filter((b) => b.subjectId === subject.id && b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 5)
  const sessions = state.sessions.filter((s) => s.subjectId === subject.id).slice(0, 5)
  // Clases semanales, empezando por el primer día de la semana configurado.
  const weekPos = (dow: number) => (dow - state.settings.weekStartsOn + 7) % 7
  const classSlots = state.timetable.slots
    .filter((s) => s.subjectId === subject.id)
    .sort((a, b) => weekPos(a.weekday) - weekPos(b.weekday) || minutesFromClock(a.start) - minutesFromClock(b.start))

  const remove = async () => {
    const ok = await confirm({
      title: t('subjects.deleteTitle'),
      message: t('subjects.deleteBody', { title: subject.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteSubject', id: subject.id })
    toast(t('subjects.deleted'), { tone: 'info' })
    navigate('subjects')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('subjects')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        {t('subjects.back')}
      </button>

      {/* ------------------------------- hero -------------------------------- */}
      <Card as="div" className="relative mb-5 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, ${tint} 16%, transparent), transparent 62%)`,
          }}
          aria-hidden="true"
        />
        <div className="relative p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <SubjectMark subject={subject} size={56} />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge color={SUBJECT_STATUSES[subject.status].color}>
                  {t(SUBJECT_STATUSES[subject.status].labelKey)}
                </Badge>
                {subject.term ? <span className="text-xs text-ink-3">{subject.term}</span> : null}
                {subject.credits ? (
                  <>
                    <span className="text-ink-3">·</span>
                    <span className="tnum text-xs text-ink-3">
                      {t('subjects.credits', { n: formatCredits(subject.credits) })}
                    </span>
                  </>
                ) : null}
              </div>
              <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-3xl">
                {subject.name}
              </h1>
              {subject.professor || subject.room ? (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                  {subject.professor ? (
                    <span className="inline-flex items-center gap-1.5">
                      <User size={14} className="text-ink-3" />
                      <span className="sr-only">{t('subjects.professor')}: </span>
                      {subject.professor}
                    </span>
                  ) : null}
                  {subject.room ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={14} className="text-ink-3" />
                      <span className="sr-only">{t('subjects.room')}: </span>
                      {subject.room}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>

          {subject.notes ? (
            <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
              {subject.notes}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate(`focus?subject=${subject.id}`)}>
              <Timer size={15} />
              {t('subjects.study')}
            </Button>
            {subject.link ? (
              <a
                href={subject.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9.5 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-base font-medium text-ink transition-colors hover:bg-surface-2"
              >
                <ExternalLink size={14} />
                {t('subjects.openLink')}
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => setEditorOpen(true)}>
              <Pencil size={14} />
              {t('common.edit')}
            </Button>
            <Button variant="danger" onClick={remove}>
              <Trash2 size={14} />
              {t('common.delete')}
            </Button>
          </div>
        </div>

        <dl className="relative grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          {[
            {
              label: grades.final !== null ? t('subjects.gradeFinal') : t('subjects.gradeCurrent'),
              value: shownGrade !== null ? formatGrade(shownGrade) : '—',
            },
            { label: t('subjects.statTasks'), value: String(stats.openTasks.length) },
            { label: t('subjects.statWeekShort'), value: stats.minutesWeek ? formatDuration(stats.minutesWeek) : '0m' },
            { label: t('subjects.statTotal'), value: stats.minutesTotal ? formatDuration(stats.minutesTotal) : '0m' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface px-4 py-3.5 sm:px-5">
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="tnum mt-1 text-lg font-semibold leading-tight text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
        {/* --------------------------- evaluation ---------------------------- */}
        <EvaluationCard subject={subject} />

        {/* ------------------------------ tasks ------------------------------ */}
        <Card>
          <CardHeader
            title={t('subjects.tasksCard')}
            subtitle={tasks.length ? t('subjects.tasksCardSub', { n: stats.openTasks.length }) : undefined}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingTask(null)
                  setTaskEditorOpen(true)
                }}
              >
                <Plus size={14} />
                {t('common.add')}
              </Button>
            }
          />
          <div className="p-2 pb-3">
            {tasks.length ? (
              tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={setDetailTask} showDate />)
            ) : (
              <EmptyState
                compact
                title={t('subjects.noTasksTitle')}
                description={t('subjects.noTasksBody')}
              />
            )}
          </div>
        </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {/* ------------------------------ classes ---------------------------- */}
          <Card>
            <CardHeader
              title={t('subjects.classesCard')}
              icon={<CalendarDays size={16} />}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('timetable')}>
                  {t('subjects.editSchedule')}
                </Button>
              }
            />
            <div className="p-4 pt-3">
              {classSlots.length ? (
                <ul className="space-y-1">
                  {classSlots.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ background: tint }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="tnum text-sm font-medium text-ink">
                          <span className="first-letter:uppercase">{weekdayShort(s.weekday)}</span>{' '}
                          {formatClock(s.start)}–{formatClock(s.end)}
                        </p>
                        <p className="truncate text-2xs text-ink-3">
                          {[t(CLASS_KINDS[s.kind].labelKey), s.room].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  title={t('subjects.classesEmptyTitle')}
                  description={t('subjects.classesEmptyBody')}
                />
              )}
            </div>
          </Card>

          {/* ------------------------------ blocks ----------------------------- */}
          <Card>
            <CardHeader
              title={t('subjects.blocksCard')}
              icon={<CalendarRange size={16} />}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('planner')}>
                  {t('nav.planner')}
                </Button>
              }
            />
            <div className="p-4 pt-3">
              {upcomingBlocks.length ? (
                <ul className="space-y-1">
                  {upcomingBlocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ background: tint }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{b.title}</p>
                        <p className="tnum text-2xs text-ink-3">
                          {relDay(b.date, today)} · {formatClock(b.start)}-{formatClock(b.end)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  title={t('subjects.noBlocksTitle')}
                  description={t('subjects.noBlocksBody')}
                />
              )}
            </div>
          </Card>

          {/* ----------------------------- sessions ---------------------------- */}
          <Card>
            <CardHeader title={t('subjects.sessionsCard')} icon={<Timer size={16} />} />
            <div className="p-4 pt-3">
              {sessions.length ? (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2">
                      <span className="text-sm text-ink-2">
                        {relDay(s.date, today)}
                        <span className="text-ink-3"> · {formatShortDate(s.date)}</span>
                      </span>
                      <span className="tnum text-xs font-semibold text-ink-2">{s.actualMinutes}m</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  title={t('subjects.noSessionsTitle')}
                  description={t('subjects.noSessionsBody')}
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      <SubjectEditor open={editorOpen} onClose={() => setEditorOpen(false)} subject={subject} />
      <TaskDetail
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onEdit={(task) => {
          setDetailTask(null)
          setEditingTask(task)
          setTaskEditorOpen(true)
        }}
      />
      <TaskEditor
        open={taskEditorOpen}
        onClose={() => {
          setTaskEditorOpen(false)
          setEditingTask(null)
        }}
        task={editingTask}
        defaultSubjectId={subject.id}
      />
    </>
  )
}
