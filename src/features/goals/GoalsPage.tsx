import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleDot,
  Flag,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar, ProgressRing } from '@/components/ui/Progress'
import { Segmented } from '@/components/ui/Segmented'
import { TextInput } from '@/components/ui/Field'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { CATEGORIES, colorVar } from '@/lib/constants'
import { goalProgress } from '@/lib/analytics'
import { diffDays, formatShortDate } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import type { TranslationKey } from '@/i18n/es'
import { uid } from '@/lib/id'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import type { Goal, GoalStatus } from '@/types'
import { GoalEditor } from './GoalEditor'
import { TaskRow } from '../tasks/TaskRow'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'
import type { Task } from '@/types'

const STATUS_META: Record<GoalStatus, { labelKey: TranslationKey; tone: string }> = {
  active: { labelKey: 'goals.statusActive', tone: 'text-good' },
  completed: { labelKey: 'goals.statusCompleted', tone: 'text-ink-3' },
  paused: { labelKey: 'goals.statusPaused', tone: 'text-warn' },
}

function useDeadlineLabel() {
  const t = useT()
  return (goal: Goal, today: string): { text: string; urgent: boolean } => {
    const days = diffDays(goal.targetDate, today)
    if (goal.status === 'completed') return { text: t('goals.achieved'), urgent: false }
    if (days < 0) return { text: t('goals.overdue', { n: Math.abs(days) }), urgent: true }
    if (days === 0) return { text: t('goals.dueToday'), urgent: true }
    if (days <= 14) return { text: t('goals.daysLeft', { n: days }), urgent: true }
    if (days < 60) return { text: t('goals.daysLeft', { n: days }), urgent: false }
    return { text: t('goals.monthsLeft', { n: Math.round(days / 30) }), urgent: false }
  }
}

function GoalCard({ goal, today }: { goal: Goal; today: string }) {
  const t = useT()
  const deadlineLabel = useDeadlineLabel()
  const progress = goalProgress(goal)
  const tint = colorVar(goal.color)
  const deadline = deadlineLabel(goal, today)
  const doneCount = goal.milestones.filter((m) => m.done).length

  return (
    <Card className="group overflow-hidden transition-shadow duration-200 hover:shadow-pop">
      <button
        type="button"
        onClick={() => navigate(`goals/${goal.id}`)}
        className="w-full p-5 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge color={CATEGORIES[goal.category].color}>
                {t(CATEGORIES[goal.category].labelKey)}
              </Badge>
              <span className={cn('text-xs font-medium', STATUS_META[goal.status].tone)}>
                {t(STATUS_META[goal.status].labelKey)}
              </span>
            </div>
            <h3 className="text-md font-semibold leading-snug tracking-[-0.01em] text-ink">
              {goal.title}
            </h3>
            {goal.description ? (
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-3">
                {goal.description}
              </p>
            ) : null}
          </div>

          <ProgressRing value={progress} size={64} thickness={7} color={goal.color}>
            <span className="tnum text-sm font-semibold text-ink">
              {Math.round(progress * 100)}
              <span className="ml-px text-2xs font-medium text-ink-3">%</span>
            </span>
          </ProgressRing>
        </div>

        <div className="mt-4">
          <ProgressBar value={progress} color={goal.color} height={6} label={goal.title} />
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="text-ink-3">
              <span className="tnum font-semibold text-ink-2">
                {doneCount}/{goal.milestones.length || 0}
              </span>{' '}
              {t('goals.milestonesCount')}
            </span>
            <span
              className={cn('inline-flex items-center gap-1', deadline.urgent ? 'font-medium text-warn' : 'text-ink-3')}
              style={goal.status === 'completed' ? { color: tint } : undefined}
            >
              <CalendarClock size={12} />
              {deadline.text}
            </span>
          </div>
        </div>
      </button>
    </Card>
  )
}

export function GoalsPage() {
  const { state, today } = useApp()
  const t = useT()
  const [tab, setTab] = useState<GoalStatus | 'all'>('active')
  const [editorOpen, setEditorOpen] = useState(false)

  const counts = useMemo(
    () => ({
      all: state.goals.length,
      active: state.goals.filter((g) => g.status === 'active').length,
      completed: state.goals.filter((g) => g.status === 'completed').length,
      paused: state.goals.filter((g) => g.status === 'paused').length,
    }),
    [state.goals],
  )

  const visible = state.goals.filter((g) => (tab === 'all' ? true : g.status === tab))

  return (
    <>
      <PageHeader
        title={t('goals.title')}
        subtitle={
          counts.all
            ? t('goals.subtitle', { active: counts.active, done: counts.completed })
            : t('goals.subtitleEmpty')
        }
        actions={
          <Button variant="primary" onClick={() => setEditorOpen(true)}>
            <Plus size={16} />
            {t('goals.new')}
          </Button>
        }
      />

      {counts.all > 0 ? (
        <div className="mb-5">
          <Segmented
            ariaLabel={t('goals.filterLabel')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'active', label: t('goals.tabActive', { n: counts.active }) },
              { value: 'completed', label: t('goals.tabCompleted', { n: counts.completed }) },
              { value: 'paused', label: t('goals.tabPaused', { n: counts.paused }) },
              { value: 'all', label: t('common.all') },
            ]}
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={22} />}
            title={
              counts.all
                ? t('goals.emptyFiltered', {
                    tab: tab === 'all' ? t('common.all') : t(STATUS_META[tab].labelKey),
                  })
                : t('goals.emptyTitle')
            }
            description={counts.all ? t('goals.emptyFilteredBody') : t('goals.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setEditorOpen(true)}>
                <Plus size={15} />
                {t('goals.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {visible.map((goal) => (
            <GoalCard key={goal.id} goal={goal} today={today} />
          ))}
        </div>
      )}

      <GoalEditor open={editorOpen} onClose={() => setEditorOpen(false)} goal={null} />
    </>
  )
}

/* ------------------------------ detail screen ----------------------------- */

export function GoalDetailPage({ goalId }: { goalId: string }) {
  const { state, dispatch, today } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()
  const relDay = useRelativeDay()
  const deadlineLabel = useDeadlineLabel()
  const [editorOpen, setEditorOpen] = useState(false)
  const [newMilestone, setNewMilestone] = useState('')
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)

  const goal = state.goals.find((g) => g.id === goalId)

  if (!goal) {
    return (
      <Card>
        <EmptyState
          icon={<Target size={22} />}
          title={t('goals.notFoundTitle')}
          description={t('goals.notFoundBody')}
          action={
            <Button variant="secondary" onClick={() => navigate('goals')}>
              {t('goals.backToAll')}
            </Button>
          }
        />
      </Card>
    )
  }

  const progress = goalProgress(goal)
  const tint = colorVar(goal.color)
  const deadline = deadlineLabel(goal, today)
  const linkedTasks = state.tasks.filter((t) => t.goalId === goal.id)
  const openTasks = linkedTasks.filter((t) => t.status !== 'done')
  const focusMinutes = state.sessions
    .filter((s) => s.goalId === goal.id)
    .reduce((sum, s) => sum + s.actualMinutes, 0)

  const addMilestone = () => {
    const title = newMilestone.trim()
    if (!title) return
    dispatch({
      type: 'addMilestone',
      goalId: goal.id,
      milestone: { id: uid('ms'), title, done: false, targetDate: null, completedAt: null },
    })
    setNewMilestone('')
    toast(t('goals.milestoneAdded'))
  }

  const remove = async () => {
    const ok = await confirm({
      title: t('goals.deleteTitle'),
      message: t('goals.deleteBody', { title: goal.title, n: goal.milestones.length }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteGoal', id: goal.id })
    toast(t('goals.deleted'), { tone: 'info' })
    navigate('goals')
  }

  const toggleStatus = () => {
    const next: GoalStatus = goal.status === 'paused' ? 'active' : 'paused'
    dispatch({ type: 'patchGoal', id: goal.id, patch: { status: next } })
    toast(next === 'paused' ? t('goals.paused') : t('goals.resumed'))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('goals')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        {t('goals.backToAll')}
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
        <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge color={CATEGORIES[goal.category].color}>
                {t(CATEGORIES[goal.category].labelKey)}
              </Badge>
              <span className={cn('text-xs font-medium', STATUS_META[goal.status].tone)}>
                {t(STATUS_META[goal.status].labelKey)}
              </span>
              <span className="text-ink-3">·</span>
              <span
                className={cn('inline-flex items-center gap-1 text-xs', deadline.urgent ? 'font-medium text-warn' : 'text-ink-3')}
              >
                <CalendarClock size={13} />
                {deadline.text} · {formatShortDate(goal.targetDate)}
              </span>
            </div>

            <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-3xl">
              {goal.title}
            </h1>
            {goal.description ? (
              <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-2">{goal.description}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditorOpen(true)}>
                <Pencil size={14} />
                {t('common.edit')}
              </Button>
              {goal.status !== 'completed' ? (
                <Button variant="secondary" onClick={toggleStatus}>
                  {goal.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                  {goal.status === 'paused' ? t('goals.resume') : t('goals.pause')}
                </Button>
              ) : null}
              <Button variant="danger" onClick={remove}>
                <Trash2 size={14} />
                {t('common.delete')}
              </Button>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-4 lg:w-[220px]">
            <ProgressRing value={progress} size={148} thickness={12} color={goal.color}>
              <span className="tnum text-3xl font-semibold leading-[1.1] tracking-tight text-ink">
                {Math.round(progress * 100)}
                <span className="text-lg text-ink-3">%</span>
              </span>
              <span className="mt-1 text-2xs text-ink-3">{t('goals.complete')}</span>
            </ProgressRing>
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 px-2 py-2">
                <p className="tnum text-md font-semibold text-ink">{openTasks.length}</p>
                <p className="text-2xs text-ink-3">{t('goals.openTasks')}</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-2">
                <p className="tnum text-md font-semibold text-ink">{Math.round(focusMinutes / 60)}h</p>
                <p className="text-2xs text-ink-3">{t('goals.focused')}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
        {/* --------------------------- milestones ---------------------------- */}
        <Card className="lg:col-span-3">
          <CardHeader
            title={t('goals.milestones')}
            subtitle={t('goals.milestonesSub', {
              done: goal.milestones.filter((m) => m.done).length,
              total: goal.milestones.length,
            })}
            icon={<Flag size={16} />}
          />
          <div className="p-4 pt-3">
            {goal.milestones.length ? (
              <ol className="space-y-1">
                {goal.milestones.map((m, index) => (
                  <li
                    key={m.id}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={m.done}
                      aria-label={
                        m.done
                          ? t('goals.reopenMilestone', { title: m.title })
                          : t('goals.completeMilestone', { title: m.title })
                      }
                      onClick={() =>
                        dispatch({ type: 'toggleMilestone', goalId: goal.id, milestoneId: m.id })
                      }
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                        m.done ? 'text-white' : 'border-line-strong text-transparent hover:border-ink-3',
                      )}
                      style={m.done ? { background: tint, borderColor: tint } : undefined}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>

                    <span className="tnum w-4 shrink-0 text-xs font-semibold text-ink-3">
                      {index + 1}
                    </span>

                    <span
                      className={cn(
                        'min-w-0 flex-1 text-base',
                        m.done ? 'text-ink-3 line-through' : 'text-ink',
                      )}
                    >
                      {m.title}
                      {m.targetDate ? (
                        <span className="ml-2 text-xs text-ink-3">{relDay(m.targetDate, today)}</span>
                      ) : null}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'deleteMilestone', goalId: goal.id, milestoneId: m.id })
                      }
                      aria-label={t('goals.deleteMilestone', { title: m.title })}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 opacity-0 transition-all hover:bg-bad/10 hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                compact
                icon={<CircleDot size={18} />}
                title={t('goals.noMilestonesTitle')}
                description={t('goals.noMilestonesBody')}
              />
            )}

            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <TextInput
                value={newMilestone}
                onChange={(e) => setNewMilestone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addMilestone()
                }}
                placeholder={t('goals.addMilestone')}
                aria-label={t('goals.newMilestone')}
              />
              <Button variant="secondary" onClick={addMilestone} disabled={!newMilestone.trim()}>
                <Plus size={15} />
                {t('common.add')}
              </Button>
            </div>
          </div>
        </Card>

        {/* -------------------------- linked tasks --------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('goals.linkedTasks')}
            subtitle={linkedTasks.length ? t('goals.linkedTasksSub', { n: openTasks.length }) : undefined}
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
            {linkedTasks.length ? (
              linkedTasks
                .slice()
                .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
                .map((task) => <TaskRow key={task.id} task={task} onOpen={setDetailTask} showDate />)
            ) : (
              <EmptyState
                compact
                title={t('goals.noLinkedTitle')}
                description={t('goals.noLinkedBody')}
              />
            )}
          </div>
        </Card>
      </div>

      <GoalEditor open={editorOpen} onClose={() => setEditorOpen(false)} goal={goal} />
      <TaskDetail
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onEdit={(t) => {
          setDetailTask(null)
          setEditingTask(t)
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
        defaultGoalId={goal.id}
      />
    </>
  )
}
