import { useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, CalendarCheck, Flame, Minus, Target, Timer } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar } from '@/components/ui/Progress'
import { Segmented } from '@/components/ui/Segmented'
import { BarChart, DonutChart, TrendChart, type Point } from '@/components/charts/Charts'
import { cn } from '@/lib/cn'
import { CATEGORIES, colorVar } from '@/lib/constants'
import {
  buildSeries,
  categoryBreakdown,
  goalProgress,
  habitStreaks,
  productivityPeak,
  summarize,
  trendDelta,
} from '@/lib/analytics'
import { formatDuration, formatShortDate, fromISO, weekdayShort } from '@/lib/date'
import { useI18n, useT } from '@/i18n/I18nProvider'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'

function DeltaPill({ value }: { value: number | null }) {
  if (value === null) return null
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  const tone = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-ink-3'
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', tone)}>
      <Icon size={13} strokeWidth={2.6} />
      {Math.abs(value)}%
    </span>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  delta,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  delta?: number | null
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
          {icon}
        </span>
        {delta !== undefined ? <DeltaPill value={delta ?? null} /> : null}
      </div>
      <p className="tnum mt-3 text-2xl font-semibold leading-[1.1] tracking-tight text-ink">{value}</p>
      <p className="mt-1.5 text-sm font-medium text-ink-2">{label}</p>
      <p className="mt-0.5 text-xs text-ink-3">{sub}</p>
    </Card>
  )
}

export function AnalyticsPage() {
  const { state, today } = useApp()
  const t = useT()
  const { locale } = useI18n()
  const [range, setRange] = useState<7 | 30>(7)

  const series = useMemo(() => buildSeries(state, range, today), [state, range, today])
  const summary = useMemo(() => summarize(series), [series])
  const peak = useMemo(() => productivityPeak(state, today), [state, today])
  const breakdown = useMemo(() => categoryBreakdown(state, range, today), [state, range, today])

  const label = (iso: string) =>
    range === 7
      ? fromISO(iso).toLocaleDateString(locale, { weekday: 'short' })
      : String(Number(iso.slice(8, 10)))

  const taskPoints: Point[] = series.map((d) => ({
    label: label(d.date),
    value: d.tasksDone,
    caption: formatShortDate(d.date),
  }))
  const focusPoints: Point[] = series.map((d) => ({
    label: label(d.date),
    value: d.focusMinutes,
    caption: formatShortDate(d.date),
  }))
  const habitPoints: Point[] = series.map((d) => ({
    label: label(d.date),
    value: Math.round(d.habitRatio * 100),
    caption: formatShortDate(d.date),
  }))

  const activeGoals = state.goals.filter((g) => g.status !== 'completed')
  const avgGoalProgress = activeGoals.length
    ? activeGoals.reduce((s, g) => s + goalProgress(g), 0) / activeGoals.length
    : 0

  const topHabits = state.habits
    .filter((h) => !h.archived)
    .map((h) => ({ habit: h, streak: habitStreaks(h, today) }))
    .sort((a, b) => b.streak.current - a.streak.current)
    .slice(0, 5)

  const hasData = state.tasks.length > 0 || state.sessions.length > 0 || state.habits.length > 0

  if (!hasData) {
    return (
      <>
        <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitleEmpty')} />
        <Card>
          <EmptyState
            icon={<Activity size={22} />}
            title={t('analytics.emptyTitle')}
            description={t('analytics.emptyBody')}
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle', { range, days: summary.activeDays })}
        actions={
          <Segmented
            ariaLabel={t('analytics.rangeLabel')}
            value={String(range) as '7' | '30'}
            onChange={(v) => setRange(Number(v) as 7 | 30)}
            options={[
              { value: '7', label: t('analytics.days7') },
              { value: '30', label: t('analytics.days30') },
            ]}
          />
        }
      />

      {/* ------------------------------- KPIs -------------------------------- */}
      <div className="mb-4 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<CalendarCheck size={16} />}
          label={t('analytics.tasksCompleted')}
          value={String(summary.tasksDone)}
          sub={t('analytics.tasksPerDay', { n: summary.avgTasksPerDay.toFixed(1) })}
          delta={trendDelta(series, (d) => d.tasksDone)}
        />
        <StatCard
          icon={<Timer size={16} />}
          label={t('analytics.focusTime')}
          value={formatDuration(summary.focusMinutes)}
          sub={t('analytics.sessions', { n: summary.sessions })}
          delta={trendDelta(series, (d) => d.focusMinutes)}
        />
        <StatCard
          icon={<Flame size={16} />}
          label={t('analytics.habitConsistency')}
          value={`${Math.round(summary.habitRatio * 100)}%`}
          sub={t('analytics.habitsTracked', { n: state.habits.filter((h) => !h.archived).length })}
          delta={trendDelta(series, (d) => d.habitRatio * 100)}
        />
        <StatCard
          icon={<Target size={16} />}
          label={t('analytics.goalProgress')}
          value={`${Math.round(avgGoalProgress * 100)}%`}
          sub={t('analytics.goalsInFlight', { n: activeGoals.length })}
        />
      </div>

      {/* ------------------------------ charts ------------------------------- */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('analytics.tasksCompleted')}
            subtitle={t('analytics.tasksOverRange', { n: summary.tasksDone, range })}
          />
          <div className="px-3 pb-4 pt-2">
            <BarChart data={taskPoints} ariaLabel={t('analytics.chartTasks')} color="brand" />
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('analytics.focusMinutes')}
            subtitle={`${formatDuration(summary.focusMinutes)} ${t('analytics.totalSuffix')}`}
          />
          <div className="px-3 pb-4 pt-2">
            <TrendChart
              data={focusPoints}
              ariaLabel={t('analytics.chartFocus')}
              color="indigo"
              formatValue={(v) => `${v}m`}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('analytics.habitConsistency')}
            subtitle={t('analytics.habitsSub', { pct: Math.round(summary.habitRatio * 100) })}
          />
          <div className="px-3 pb-4 pt-2">
            {state.habits.length ? (
              <TrendChart
                data={habitPoints}
                ariaLabel={t('analytics.chartHabits')}
                color="emerald"
                formatValue={(v) => `${v}%`}
              />
            ) : (
              <EmptyState
                compact
                title={t('analytics.noHabitsTitle')}
                description={t('analytics.noHabitsBody')}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('analytics.effortTitle')} subtitle={t('analytics.effortSub')} />
          <div className="flex flex-col items-center gap-6 px-5 pb-6 pt-3 sm:flex-row sm:items-center">
            {breakdown.length ? (
              <>
                <DonutChart
                  slices={breakdown.map((b) => ({
                    label: t(CATEGORIES[b.category].labelKey),
                    value: b.count,
                    color: CATEGORIES[b.category].color,
                  }))}
                  centerValue={String(summary.tasksDone)}
                  centerLabel={t('analytics.tasksWord')}
                  ariaLabel={t('analytics.chartCategories')}
                />
                <ul className="w-full flex-1 space-y-2">
                  {breakdown.map((b) => {
                    const pct = summary.tasksDone ? Math.round((b.count / summary.tasksDone) * 100) : 0
                    return (
                      <li key={b.category} className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: colorVar(CATEGORIES[b.category].color) }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                          {t(CATEGORIES[b.category].labelKey)}
                        </span>
                        <span className="tnum text-xs font-semibold text-ink">{b.count}</span>
                        <span className="tnum w-9 text-right text-xs text-ink-3">{pct}%</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <EmptyState
                compact
                className="w-full"
                title={t('analytics.noCompletedTitle')}
                description={t('analytics.noCompletedBody')}
              />
            )}
          </div>
        </Card>
      </div>

      {/* --------------------------- peak + goals ---------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title={t('analytics.peakTitle')}
            subtitle={t('analytics.peakSub')}
            icon={<Activity size={16} />}
          />
          <div className="space-y-4 p-5 pt-3">
            {peak ? (
              <>
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="eyebrow">
                    {t('analytics.peakDay')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-ink">
                    {weekdayShort(peak.weekdayIndex)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {t('analytics.peakDayCount', { n: peak.weekdayCount })}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="eyebrow">
                    {t('analytics.peakWindow')}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{peak.hourLabel}</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {t('analytics.peakWindowCount', { n: peak.hourCount })}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-ink-3">
                  {t('analytics.peakNote', {
                    pattern: t(`energy.${state.profile.energyPattern}` as 'energy.morning'),
                  })}
                </p>
              </>
            ) : (
              <EmptyState
                compact
                title={t('analytics.notEnoughTitle')}
                description={t('analytics.notEnoughBody')}
              />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t('analytics.goalProgress')}
            subtitle={t('analytics.activeGoals', { n: activeGoals.length })}
          />
          <div className="p-5 pt-3">
            {activeGoals.length ? (
              <ul className="space-y-4">
                {activeGoals.map((goal) => {
                  const progress = goalProgress(goal)
                  return (
                    <li key={goal.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`goals/${goal.id}`)}
                        className="-my-1 w-full py-1 text-left"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-ink">
                            {goal.title}
                          </span>
                          <span className="tnum shrink-0 text-xs font-semibold text-ink-2">
                            {Math.round(progress * 100)}%
                          </span>
                        </div>
                        <ProgressBar value={progress} color={goal.color} height={6} label={goal.title} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                title={t('analytics.noActiveGoals')}
                description={t('analytics.noActiveGoalsBody')}
              />
            )}
          </div>

          {topHabits.length ? (
            <div className="border-t border-line p-5">
              <p className="mb-3 eyebrow">
                {t('analytics.longestStreaks')}
              </p>
              <div className="flex flex-wrap gap-2">
                {topHabits.map(({ habit, streak }) => (
                  <Badge key={habit.id} color={habit.color} icon={<Flame size={11} />}>
                    {habit.name} · {streak.current}d
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}
