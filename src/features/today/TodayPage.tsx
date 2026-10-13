import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarRange,
  Check,
  Flame,
  Plus,
  Repeat,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar, ProgressRing } from '@/components/ui/Progress'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { BLOCK_CATEGORIES, colorVar, habitIcon } from '@/lib/constants'
import {
  computeTodayScore,
  goalProgress,
  habitDoneOn,
  habitDueOn,
  habitStreaks,
  scoreVerdict,
  tasksCompletedOn,
  type ScorePart,
} from '@/lib/analytics'
import { formatClock, formatFullDate, greetingKey, minutesFromClock, nowClock } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import type { Task } from '@/types'
import { TaskRow } from '../tasks/TaskRow'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'
import { quickAddTask } from '../tasks/taskUtils'
import { ExamsCard } from '../exams/ExamsCard'
import { ClassesCard } from '../timetable/ClassesCard'
import { WorkoutsCard } from './WorkoutsCard'

/* ------------------------------- score hero ------------------------------- */

/** Renders a score component's numbers, or the "nothing due" copy for it. */
function partDetail(t: ReturnType<typeof useT>, part: ScorePart): string {
  if (!part.detail) {
    return part.key === 'habits' ? t('today.partHabitsNone') : t('today.partScheduleNone')
  }
  const { done, target } = part.detail
  if (part.key === 'focus') return t('today.partFocusDetail', { done, target })
  if (part.key === 'habits') return t('today.partHabitsDetail', { done, due: target })
  if (part.key === 'schedule') return t('today.partScheduleDetail', { done, total: target })
  return t('today.partTasksDetail', { done, target })
}

function ScoreHero() {
  const { state, today } = useApp()
  const t = useT()
  const { score, parts } = computeTodayScore(state, today)
  const verdict = scoreVerdict(score)

  return (
    <Card className="relative overflow-hidden lg:col-span-2">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(110% 80% at 0% 0%, color-mix(in srgb, var(--brand) 12%, transparent), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex shrink-0 justify-center">
          {/* Solo la cifra. La etiqueta era más ancha que la cuerda interior del
              anillo y se cruzaba con el trazo; el título de la tarjeta la nombra. */}
          <ProgressRing value={score / 100} size={132} thickness={11} color="brand">
            <span className="tnum text-4xl font-semibold leading-[1.1] tracking-tight text-ink">
              {score}
            </span>
          </ProgressRing>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="text-md font-semibold tracking-[-0.011em] text-ink">
              {t('today.scoreLabel')}
            </h2>
            <Badge color={verdict.tone === 'good' ? 'emerald' : verdict.tone === 'warn' ? 'amber' : 'slate'}>
              {score >= 60 ? t('today.onTrack') : t('today.keepGoing')}
            </Badge>
          </div>
          <p className="mb-4 text-sm text-ink-3">{t(verdict.labelKey)}</p>

          <ul className="space-y-2.5">
            {parts.map((part) => (
              <li key={part.key} className="flex items-center gap-3">
                <span className="w-[68px] shrink-0 text-xs font-medium text-ink-2">
                  {t(part.labelKey)}
                </span>
                <div className="min-w-0 flex-1">
                  <ProgressBar
                    value={part.ratio ?? 0}
                    color={part.ratio === null ? 'slate' : 'brand'}
                    height={6}
                    label={t(part.labelKey)}
                  />
                </div>
                <span className="w-[104px] shrink-0 text-right text-xs text-ink-3">
                  {partDetail(t, part)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------- focus card ------------------------------- */

function FocusCard() {
  const { state, today } = useApp()
  const t = useT()
  const minutes = state.sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + s.actualMinutes, 0)
  const target = state.settings.dailyFocusTargetMin
  const nextTask = state.tasks.find((t) => t.status === 'in_progress') ??
    state.tasks.find((t) => t.status === 'today')

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('today.focusCard')}
        subtitle={t('today.focusCardSub')}
        icon={<Timer size={16} />}
      />
      <div className="flex flex-1 flex-col justify-between p-5 pt-3">
        <div>
          <p className="tnum text-3xl font-semibold leading-[1.1] tracking-tight text-ink">
            {Math.floor(minutes / 60)}
            <span className="text-md text-ink-3">h </span>
            {minutes % 60}
            <span className="text-md text-ink-3">m</span>
          </p>
          <p className="mt-1.5 text-xs text-ink-3">{t('today.focusTarget', { n: target })}</p>
          <div className="mt-3">
            <ProgressBar
            value={minutes / Math.max(1, target)}
            color="brand"
            height={6}
            label={t('today.partFocus')}
          />
          </div>
        </div>

        <Button
          block
          variant="primary"
          className="mt-5"
          onClick={() => navigate(nextTask ? `focus?task=${nextTask.id}` : 'focus')}
        >
          <Sparkles size={15} />
          {nextTask ? t('today.startSession') : t('today.openTimer')}
        </Button>
        {nextTask ? (
          <p className="mt-2 truncate text-center text-2xs text-ink-3" title={nextTask.title}>
            {t('today.workingOn', { title: nextTask.title })}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

/* -------------------------------- schedule -------------------------------- */

function ScheduleCard() {
  const { state, dispatch, today } = useApp()
  const t = useT()
  const blocks = state.blocks
    .filter((b) => b.date === today)
    .sort((a, b) => minutesFromClock(a.start) - minutesFromClock(b.start))
  const now = minutesFromClock(nowClock())

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('today.scheduleTitle')}
        subtitle={
          blocks.length
            ? t('today.scheduleSub', {
                done: blocks.filter((b) => b.done).length,
                total: blocks.length,
              })
            : undefined
        }
        icon={<CalendarRange size={16} />}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('planner')}>
            {t('nav.planner')}
            <ArrowRight size={13} />
          </Button>
        }
      />

      <div className="flex-1 p-4 pt-2">
        {blocks.length ? (
          <ol className="relative space-y-1 pl-1">
            {blocks.map((block) => {
              const start = minutesFromClock(block.start)
              const end = minutesFromClock(block.end)
              const current = now >= start && now < end
              const past = now >= end
              const blockSubject = block.subjectId
                ? state.subjects.find((s) => s.id === block.subjectId)
                : null
              const tint = colorVar(blockSubject?.color ?? BLOCK_CATEGORIES[block.category].color)

              return (
                <li key={block.id} className="flex items-start gap-3">
                  <div className="flex w-[52px] shrink-0 flex-col items-end pt-1.5">
                    <span
                      className={cn(
                        'tnum text-2xs font-semibold',
                        current ? 'text-brand-ink' : past ? 'text-ink-3' : 'text-ink-2',
                      )}
                    >
                      {formatClock(block.start)}
                    </span>
                  </div>

                  <div className="relative flex flex-col items-center self-stretch pt-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--surface)]"
                      style={{ background: current ? 'var(--brand)' : tint, opacity: past && !block.done ? 0.4 : 1 }}
                    />
                    <span className="w-px flex-1 bg-line" />
                  </div>

                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'patchBlock', id: block.id, patch: { done: !block.done } })}
                    className={cn(
                      'group mb-1 min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2',
                      current && 'bg-brand-soft/60',
                    )}
                    aria-pressed={block.done}
                  >
                    <p
                      className={cn(
                        'truncate text-sm font-medium',
                        block.done ? 'text-ink-3 line-through' : 'text-ink',
                      )}
                    >
                      {block.title}
                    </p>
                    <p className="tnum mt-0.5 text-2xs text-ink-3">
                      {formatClock(block.start)} - {formatClock(block.end)}
                      <span className="ml-2">
                        {blockSubject ? blockSubject.name : t(BLOCK_CATEGORIES[block.category].labelKey)}
                      </span>
                      {block.done ? (
                        <span className="ml-2 text-good">{t('today.blockDone')}</span>
                      ) : null}
                    </p>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <EmptyState
            compact
            icon={<CalendarRange size={18} />}
            title={t('today.emptyScheduleTitle')}
            description={t('today.emptyScheduleBody')}
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate('planner')}>
                <Plus size={14} />
                {t('today.planDay')}
              </Button>
            }
          />
        )}
      </div>
    </Card>
  )
}

/* --------------------------------- habits --------------------------------- */

function HabitsCard() {
  const { state, dispatch, today } = useApp()
  const t = useT()
  const habits = state.habits.filter((h) => !h.archived && habitDueOn(h, today))
  const done = habits.filter((h) => habitDoneOn(h, today)).length

  return (
    <Card>
      <CardHeader
        title={t('today.habitsTitle')}
        subtitle={habits.length ? t('today.habitsSub', { done, due: habits.length }) : undefined}
        icon={<Repeat size={16} />}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('habits')}>
            {t('today.allHabits')}
            <ArrowRight size={13} />
          </Button>
        }
      />
      {/* Consulta de contenedor, no de viewport: en escritorio esta tarjeta ocupa
          un tercio de la rejilla, así que `sm:` la partía en dos columnas de
          159px y dejaba 49px para el nombre del hábito. */}
      <div className="@container p-4 pt-2">
        {habits.length ? (
          <div className="grid gap-2 grid-cols-1 @md:grid-cols-2">
            {habits.map((habit) => {
              const Icon = habitIcon(habit.icon)
              const streak = habitStreaks(habit, today)
              const isDone = habitDoneOn(habit, today)
              const tint = colorVar(habit.color)

              return (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => dispatch({ type: 'toggleHabitDay', id: habit.id, date: today })}
                  aria-pressed={isDone}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150',
                    isDone ? 'border-transparent' : 'border-line hover:border-line-strong hover:bg-surface-2',
                  )}
                  style={
                    isDone
                      ? { background: `color-mix(in srgb, ${tint} 11%, transparent)` }
                      : undefined
                  }
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
                  >
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', isDone ? 'text-ink-2' : 'text-ink')}>
                      {habit.name}
                    </p>
                    <p className="flex items-center gap-1 text-2xs text-ink-3">
                      <Flame size={11} style={{ color: streak.current ? tint : undefined }} />
                      {t('today.streakDays', { n: streak.current })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                      isDone ? 'border-transparent text-white' : 'border-line-strong text-transparent',
                    )}
                    style={isDone ? { background: tint } : undefined}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Repeat size={18} />}
            title={state.habits.length ? t('today.noHabitsDueTitle') : t('today.noHabitsTitle')}
            description={
              state.habits.length ? t('today.noHabitsDueBody') : t('today.noHabitsBody')
            }
            action={
              state.habits.length ? undefined : (
                <Button size="sm" variant="secondary" onClick={() => navigate('habits')}>
                  <Plus size={14} />
                  {t('today.addHabit')}
                </Button>
              )
            }
          />
        )}
      </div>
    </Card>
  )
}

/* ---------------------------------- goals --------------------------------- */

function GoalsCard() {
  const { state } = useApp()
  const t = useT()
  const goals = state.goals.filter((g) => g.status === 'active').slice(0, 4)

  return (
    <Card>
      <CardHeader
        title={t('today.goalsTitle')}
        icon={<Target size={16} />}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('goals')}>
            {t('today.allGoals')}
            <ArrowRight size={13} />
          </Button>
        }
      />
      <div className="p-5 pt-2">
        {goals.length ? (
          <ul className="space-y-3.5">
            {goals.map((goal) => {
              const progress = goalProgress(goal)
              return (
                <li key={goal.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`goals/${goal.id}`)}
                    className="-my-1 w-full py-1 text-left"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{goal.title}</span>
                      <span className="tnum shrink-0 text-xs font-semibold text-ink-2">
                        {Math.round(progress * 100)}%
                      </span>
                    </div>
                    <ProgressBar value={progress} color={goal.color} height={5} label={goal.title} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<Target size={18} />}
            title={t('today.noGoalsTitle')}
            description={t('today.noGoalsBody')}
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate('goals')}>
                <Plus size={14} />
                {t('today.addGoal')}
              </Button>
            }
          />
        )}
      </div>
    </Card>
  )
}

/* --------------------------------- page ----------------------------------- */

export function TodayPage() {
  const { state, dispatch, today } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()

  const [quick, setQuick] = useState('')
  const [detail, setDetail] = useState<Task | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const doneTodayIds = useMemo(
    () => new Set(tasksCompletedOn(state.tasks, today).map((t) => t.id)),
    [state.tasks, today],
  )

  const todayTasks = useMemo(
    () =>
      state.tasks
        .filter(
          (t) =>
            t.status === 'today' ||
            t.status === 'in_progress' ||
            (t.status === 'done' && doneTodayIds.has(t.id)) ||
            (t.status !== 'done' && t.dueDate === today),
        )
        .sort((a, b) => {
          if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
          const at = a.dueTime ?? '99:99'
          const bt = b.dueTime ?? '99:99'
          if (at !== bt) return at.localeCompare(bt)
          return a.order - b.order
        }),
    [state.tasks, today, doneTodayIds],
  )

  const openCount = todayTasks.filter((t) => t.status !== 'done').length
  const doneCount = todayTasks.length - openCount
  const firstName = (state.profile.name || '').split(' ')[0]

  const submitQuick = () => {
    const title = quick.trim()
    if (!title) return
    dispatch({
      type: 'addTask',
      task: quickAddTask(title, 'today', { today, subjects: state.subjects }),
    })
    setQuick('')
    toast(t('today.addedToday'))
  }

  const removeTask = async (task: Task) => {
    const ok = await confirm({
      title: t('tasks.deleteTitle'),
      message: t('tasks.deleteBody', { title: task.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteTask', id: task.id })
    toast(t('tasks.deleted'), { tone: 'info' })
  }

  return (
    <>
      {/* Saludo. La fecha acompaña al titular en su línea de base en vez de
          colgar encima como etiqueta en versales. */}
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink">
            {t(greetingKey())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-ink-3 first-letter:uppercase">{formatFullDate(today)}</p>
        </div>
        {state.profile.primaryGoal ? (
          <p className="mt-2 max-w-prose text-base text-ink-2">
            {t('today.focusSeason')}{' '}
            <span className="font-medium text-ink">{state.profile.primaryGoal}</span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <ScoreHero />
        <FocusCard />

        {/* tasks */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('today.tasksTitle')}
            subtitle={
              todayTasks.length ? t('today.tasksSub', { open: openCount, done: doneCount }) : undefined
            }
            icon={<Check size={16} />}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(null)
                  setEditorOpen(true)
                }}
              >
                <Plus size={14} />
                {t('common.new')}
              </Button>
            }
          />

          <div className="px-4 pb-2 pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3">
              <Plus size={15} className="shrink-0 text-ink-3" />
              <input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitQuick()
                }}
                placeholder={t('today.quickAdd')}
                aria-label={t('today.quickAddLabel')}
                className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              />
              {quick.trim() ? (
                <Button size="sm" variant="primary" onClick={submitQuick}>
                  {t('common.add')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="p-1.5 pt-1">
            {todayTasks.length ? (
              todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={setDetail} onDelete={removeTask} />
              ))
            ) : (
              <EmptyState
                icon={<Check size={20} />}
                title={t('today.emptyTasksTitle')}
                description={t('today.emptyTasksBody')}
                action={
                  <Button size="sm" variant="secondary" onClick={() => navigate('tasks')}>
                    {t('today.openBacklog')}
                    <ArrowRight size={14} />
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        <ClassesCard />
        <ScheduleCard />
        <ExamsCard />
        <HabitsCard />
        <GoalsCard />
        <WorkoutsCard />
      </div>

      <TaskDetail
        task={detail}
        onClose={() => setDetail(null)}
        onEdit={(t) => {
          setDetail(null)
          setEditing(t)
          setEditorOpen(true)
        }}
      />
      <TaskEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        task={editing}
        defaultStatus="today"
        defaultDate={today}
      />
    </>
  )
}
