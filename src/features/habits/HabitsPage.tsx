import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Flame, Pencil, Plus, Repeat, Sparkles, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar } from '@/components/ui/Progress'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { colorVar, habitIcon } from '@/lib/constants'
import { habitCompletion, habitDoneOn, habitDueOn, habitStreaks } from '@/lib/analytics'
import { formatShortDate, weekdayShort } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import type { Habit } from '@/types'
import { HabitEditor } from './HabitEditor'
import { HabitHeatmap, HabitWeekRow } from './HabitBits'

function useFrequencyLabel() {
  const t = useT()
  return (habit: Habit): string => {
    if (habit.frequency === 'daily') return t('habits.everyDay')
    if (habit.frequency === 'weekdays') return t('habits.weekdays')
    return habit.targetDays
      .slice()
      .sort()
      .map((d) => weekdayShort(d))
      .join(', ')
  }
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: (h: Habit) => void }) {
  const { state, dispatch, today } = useApp()
  const t = useT()
  const frequencyLabel = useFrequencyLabel()
  const Icon = habitIcon(habit.icon)
  const streaks = habitStreaks(habit, today)
  const rate = habitCompletion(habit, 30, today)
  const dueToday = habitDueOn(habit, today)
  const doneToday = habitDoneOn(habit, today)
  const tint = colorVar(habit.color)

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-pop">
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}
        >
          <Icon size={20} />
        </span>

        <button
          type="button"
          onClick={() => navigate(`habits/${habit.id}`)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-md font-semibold tracking-[-0.01em] text-ink">{habit.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">{frequencyLabel(habit)}</p>
        </button>

        <button
          type="button"
          onClick={() => onEdit(habit)}
          aria-label={t('habits.editLabel', { name: habit.name })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="px-4">
        <HabitWeekRow
          habit={habit}
          anchor={today}
          today={today}
          weekStartsOn={state.settings.weekStartsOn}
          onToggle={(date) => dispatch({ type: 'toggleHabitDay', id: habit.id, date })}
          size={30}
        />
      </div>

      <div className="mt-4 flex items-center gap-4 px-4">
        <div className="flex items-center gap-1.5">
          <Flame size={14} style={{ color: streaks.current > 0 ? tint : 'var(--ink-3)' }} />
          <span className="tnum text-sm font-semibold text-ink">{streaks.current}</span>
          <span className="text-xs text-ink-3">{t('habits.streak')}</span>
        </div>
        <div className="text-xs text-ink-3">
          {t('habits.best')} <span className="tnum font-semibold text-ink-2">{streaks.best}</span>
        </div>
      </div>

      <div className="mt-3 px-4">
        <div className="mb-1.5 flex items-center justify-between text-2xs">
          <span className="text-ink-3">{t('habits.last30')}</span>
          <span className="tnum font-semibold text-ink-2">{Math.round(rate * 100)}%</span>
        </div>
        <ProgressBar value={rate} color={habit.color} height={6} label={`${habit.name} completion`} />
      </div>

      <div className="mt-4 border-t border-line p-3">
        <Button
          block
          variant={doneToday ? 'soft' : 'secondary'}
          onClick={() => dispatch({ type: 'toggleHabitDay', id: habit.id, date: today })}
          disabled={!dueToday}
        >
          {doneToday ? (
            <>
              <Check size={15} />
              {t('habits.doneToday')}
            </>
          ) : dueToday ? (
            t('habits.markDone')
          ) : (
            t('habits.notScheduled')
          )}
        </Button>
      </div>
    </Card>
  )
}

export function HabitsPage() {
  const { state, today } = useApp()
  const t = useT()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)

  const habits = state.habits.filter((h) => !h.archived)
  const dueToday = habits.filter((h) => habitDueOn(h, today))
  const doneToday = dueToday.filter((h) => habitDoneOn(h, today))

  const openEditor = (habit: Habit | null) => {
    setEditing(habit)
    setEditorOpen(true)
  }

  return (
    <>
      <PageHeader
        title={t('habits.title')}
        subtitle={
          habits.length
            ? t('habits.subtitle', {
                done: doneToday.length,
                due: dueToday.length,
                total: habits.length,
              })
            : t('habits.subtitleEmpty')
        }
        actions={
          <Button variant="primary" onClick={() => openEditor(null)}>
            <Plus size={16} />
            {t('habits.new')}
          </Button>
        }
      />

      {habits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat size={22} />}
            title={t('habits.emptyTitle')}
            description={t('habits.emptyBody')}
            action={
              <Button variant="primary" onClick={() => openEditor(null)}>
                <Plus size={15} />
                {t('habits.createFirst')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {habits.map((habit) => (
            <HabitCard key={habit.id} habit={habit} onEdit={openEditor} />
          ))}
        </div>
      )}

      <HabitEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        habit={editing}
      />
    </>
  )
}

/* ------------------------------ detail screen ----------------------------- */

export function HabitDetailPage({ habitId }: { habitId: string }) {
  const { state, dispatch, today } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()
  const relDay = useRelativeDay()
  const frequencyLabel = useFrequencyLabel()
  const [editorOpen, setEditorOpen] = useState(false)

  const habit = state.habits.find((h) => h.id === habitId)

  const stats = useMemo(() => {
    if (!habit) return null
    return {
      streaks: habitStreaks(habit, today),
      rate7: habitCompletion(habit, 7, today),
      rate30: habitCompletion(habit, 30, today),
      rate90: habitCompletion(habit, 90, today),
    }
  }, [habit, today])

  if (!habit || !stats) {
    return (
      <Card>
        <EmptyState
          icon={<Repeat size={22} />}
          title={t('habits.notFoundTitle')}
          description={t('habits.notFoundBody')}
          action={
            <Button variant="secondary" onClick={() => navigate('habits')}>
              {t('habits.backToAll')}
            </Button>
          }
        />
      </Card>
    )
  }

  const Icon = habitIcon(habit.icon)
  const tint = colorVar(habit.color)
  const doneToday = habitDoneOn(habit, today)
  const dueToday = habitDueOn(habit, today)
  const recent = habit.log.slice(0, 8)

  const remove = async () => {
    const ok = await confirm({
      title: t('habits.deleteTitle'),
      message: t('habits.deleteBody', { name: habit.name, n: habit.log.length }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteHabit', id: habit.id })
    toast(t('habits.deleted'), { tone: 'info' })
    navigate('habits')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('habits')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        {t('habits.backToAll')}
      </button>

      {/* Hero */}
      <Card
        className="relative mb-5 overflow-hidden"
        as="div"
      >
        <div
          className="absolute inset-x-0 top-0 h-24"
          style={{ background: `linear-gradient(to bottom, color-mix(in srgb, ${tint} 14%, transparent), transparent)` }}
          aria-hidden="true"
        />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}
            >
              <Icon size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{habit.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge color={habit.color}>{frequencyLabel(habit)}</Badge>
                <span className="text-xs text-ink-3">
                  {t('habits.trackingSince', { date: formatShortDate(habit.createdAt.slice(0, 10)) })}
                </span>
              </div>
              {habit.description ? (
                <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-ink-2">
                  {habit.description}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditorOpen(true)}>
                <Pencil size={14} />
                {t('common.edit')}
              </Button>
              <Button variant="danger" size="icon" onClick={remove} aria-label={t('habits.deleteLabel')}>
                <Trash2 size={15} />
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('habits.currentStreak'), value: stats.streaks.current, suffix: t('habits.days') },
              { label: t('habits.bestStreak'), value: stats.streaks.best, suffix: t('habits.days') },
              { label: t('habits.last7'), value: Math.round(stats.rate7 * 100), suffix: '%' },
              { label: t('habits.last30'), value: Math.round(stats.rate30 * 100), suffix: '%' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
                <p className="text-2xs font-medium text-ink-3">{stat.label}</p>
                <p className="tnum mt-1 text-xl font-semibold leading-[1.1] tracking-tight text-ink">
                  {stat.value}
                  <span className="ml-1 text-sm font-medium text-ink-3">{stat.suffix}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button
              variant={doneToday ? 'soft' : 'primary'}
              disabled={!dueToday}
              onClick={() => dispatch({ type: 'toggleHabitDay', id: habit.id, date: today })}
            >
              {doneToday ? (
                <>
                  <Check size={15} />
                  {t('habits.completedToday')}
                </>
              ) : dueToday ? (
                <>
                  <Sparkles size={15} />
                  {t('habits.markForToday')}
                </>
              ) : (
                t('habits.notScheduled')
              )}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('habits.thisWeek')} subtitle={t('habits.thisWeekSub')} />
          <div className="p-5 pt-4">
            <HabitWeekRow
              habit={habit}
              anchor={today}
              today={today}
              weekStartsOn={state.settings.weekStartsOn}
              onToggle={(date) => dispatch({ type: 'toggleHabitDay', id: habit.id, date })}
              size={40}
            />
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{t('habits.last14Weeks')}</p>
              <span className="tnum text-xs text-ink-3">
                {t('habits.over90', { pct: Math.round(stats.rate90 * 100) })}
              </span>
            </div>
            <HabitHeatmap
              habit={habit}
              today={today}
              weekStartsOn={state.settings.weekStartsOn}
            />
            <div className="mt-3 flex items-center gap-2 text-2xs text-ink-3">
              <span>{t('habits.missed')}</span>
              <span className="h-3 w-3 rounded-[3px] bg-surface-3" />
              <span className="h-3 w-3 rounded-[3px]" style={{ background: tint, opacity: 0.55 }} />
              <span className="h-3 w-3 rounded-[3px]" style={{ background: tint }} />
              <span>{t('habits.done')}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('habits.recent')} subtitle={t('habits.recentSub', { n: habit.log.length })} />
          <div className="p-5 pt-3">
            {recent.length ? (
              <ul className="space-y-2.5">
                {recent.map((date) => (
                  <li key={date} className="flex items-center gap-3">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="text-sm text-ink">{relDay(date, today)}</span>
                    <span className="ml-auto text-xs text-ink-3">{formatShortDate(date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                title={t('habits.noLogTitle')}
                description={t('habits.noLogBody')}
              />
            )}
          </div>
        </Card>
      </div>

      <HabitEditor open={editorOpen} onClose={() => setEditorOpen(false)} habit={habit} />
    </>
  )
}
