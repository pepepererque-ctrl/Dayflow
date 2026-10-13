import type { AppState, CategoryKey, Goal, Habit, ISODate, Task } from '@/types'
import type { TranslationKey } from '@/i18n/es'
import { addDays, dayOfWeek, lastNDays, todayISO } from './date'
import { activeLocale } from './locale'

/* ------------------------------ habits ---------------------------------- */

/** Is this habit expected on the given date? */
export function habitDueOn(habit: Habit, iso: ISODate): boolean {
  const dow = dayOfWeek(iso)
  if (habit.frequency === 'daily') return true
  if (habit.frequency === 'weekdays') return dow >= 1 && dow <= 5
  return habit.targetDays.includes(dow)
}

export function habitDoneOn(habit: Habit, iso: ISODate): boolean {
  return habit.log.includes(iso)
}

export interface StreakInfo {
  current: number
  best: number
}

export function habitStreaks(habit: Habit, today: ISODate = todayISO()): StreakInfo {
  const done = new Set(habit.log)

  // Current streak: today being unfinished shouldn't break it until the day ends.
  let cursor = today
  if (habitDueOn(habit, cursor) && !done.has(cursor)) cursor = addDays(cursor, -1)
  let current = 0
  for (let guard = 0; guard < 3650; guard++) {
    if (!habitDueOn(habit, cursor)) {
      cursor = addDays(cursor, -1)
      continue
    }
    if (!done.has(cursor)) break
    current += 1
    cursor = addDays(cursor, -1)
  }

  // Best streak: single forward pass from the first logged day.
  let best = current
  if (habit.log.length) {
    const first = [...habit.log].sort()[0]
    let run = 0
    let day = first
    for (let guard = 0; guard < 3650 && day <= today; guard++) {
      if (habitDueOn(habit, day)) {
        if (done.has(day)) {
          run += 1
          if (run > best) best = run
        } else {
          run = 0
        }
      }
      day = addDays(day, 1)
    }
  }

  return { current, best }
}

/** Completion ratio over the trailing `days` window, counting only due days. */
export function habitCompletion(habit: Habit, days: number, today: ISODate = todayISO()): number {
  const window = lastNDays(days, today)
  const done = new Set(habit.log)
  let eligible = 0
  let hit = 0
  for (const iso of window) {
    if (!habitDueOn(habit, iso)) continue
    eligible += 1
    if (done.has(iso)) hit += 1
  }
  return eligible === 0 ? 0 : hit / eligible
}

/** Fraction of all habits due today that are already ticked off. */
export function habitsTodayProgress(habits: Habit[], today: ISODate = todayISO()) {
  const live = habits.filter((h) => !h.archived)
  const due = live.filter((h) => habitDueOn(h, today))
  const done = due.filter((h) => habitDoneOn(h, today))
  return { due: due.length, done: done.length, ratio: due.length ? done.length / due.length : null }
}

/* ------------------------------- goals ----------------------------------- */

export function goalProgress(goal: Goal): number {
  if (goal.status === 'completed') return 1
  if (!goal.milestones.length) return 0
  return goal.milestones.filter((m) => m.done).length / goal.milestones.length
}

/* ------------------------------- tasks ----------------------------------- */

export function tasksCompletedOn(tasks: Task[], iso: ISODate): Task[] {
  return tasks.filter((t) => t.completedAt !== null && localDateOf(t.completedAt) === iso)
}

/**
 * `completedAt` is a UTC ISO string, so slicing it can land on the wrong local
 * day. Compare against the local calendar date instead.
 */
function localDateOf(stamp: string): ISODate {
  const d = new Date(stamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function countTasksDoneOn(tasks: Task[], iso: ISODate): number {
  let n = 0
  for (const t of tasks) if (t.completedAt && localDateOf(t.completedAt) === iso) n += 1
  return n
}

export function focusMinutesOn(state: AppState, iso: ISODate): number {
  return state.sessions
    .filter((s) => s.date === iso)
    .reduce((sum, s) => sum + s.actualMinutes, 0)
}

export function blocksProgressOn(state: AppState, iso: ISODate) {
  const blocks = state.blocks.filter((b) => b.date === iso)
  const done = blocks.filter((b) => b.done)
  return { total: blocks.length, done: done.length, ratio: blocks.length ? done.length / blocks.length : null }
}

/* ---------------------------- today score -------------------------------- */

export interface ScorePart {
  key: 'tasks' | 'habits' | 'focus' | 'schedule'
  labelKey: TranslationKey
  /** The screen renders this with the numbers below. */
  detail: { done: number; target: number } | null
  /** null when the part does not apply today (e.g. no habits created yet). */
  ratio: number | null
  weight: number
}

export interface TodayScore {
  score: number
  parts: ScorePart[]
}

/**
 * Weighted 0-100 score. Parts that don't apply (no habits, nothing scheduled)
 * are dropped from both numerator and denominator rather than scored as zero,
 * so a new user is not punished for an empty planner.
 */
export function computeTodayScore(state: AppState, today: ISODate = todayISO()): TodayScore {
  const tasksDone = countTasksDoneOn(state.tasks, today)
  const target = Math.max(1, state.settings.dailyTaskTarget)
  const habits = habitsTodayProgress(state.habits, today)
  const focusMin = focusMinutesOn(state, today)
  const focusTarget = Math.max(5, state.settings.dailyFocusTargetMin)
  const schedule = blocksProgressOn(state, today)

  const parts: ScorePart[] = [
    {
      key: 'tasks',
      labelKey: 'today.partTasks',
      detail: { done: tasksDone, target },
      ratio: Math.min(1, tasksDone / target),
      weight: 35,
    },
    {
      key: 'habits',
      labelKey: 'today.partHabits',
      detail: habits.due ? { done: habits.done, target: habits.due } : null,
      ratio: habits.ratio,
      weight: 30,
    },
    {
      key: 'focus',
      labelKey: 'today.partFocus',
      detail: { done: focusMin, target: focusTarget },
      ratio: Math.min(1, focusMin / focusTarget),
      weight: 20,
    },
    {
      key: 'schedule',
      labelKey: 'today.partSchedule',
      detail: schedule.total ? { done: schedule.done, target: schedule.total } : null,
      ratio: schedule.ratio,
      weight: 15,
    },
  ]

  const applicable = parts.filter((p) => p.ratio !== null)
  const totalWeight = applicable.reduce((s, p) => s + p.weight, 0)
  const earned = applicable.reduce((s, p) => s + p.weight * (p.ratio as number), 0)
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100)

  return { score, parts }
}

export function scoreVerdict(score: number): {
  labelKey: TranslationKey
  tone: 'good' | 'warn' | 'quiet'
} {
  if (score >= 80) return { labelKey: 'today.verdictExcellent', tone: 'good' }
  if (score >= 60) return { labelKey: 'today.verdictSolid', tone: 'good' }
  if (score >= 35) return { labelKey: 'today.verdictGoing', tone: 'warn' }
  return { labelKey: 'today.verdictStart', tone: 'quiet' }
}

/* ------------------------------ trends ----------------------------------- */

export interface DayPoint {
  date: ISODate
  tasksDone: number
  habitRatio: number
  habitsDue: number
  habitsDone: number
  focusMinutes: number
  sessions: number
}

export function buildSeries(state: AppState, days: number, today: ISODate = todayISO()): DayPoint[] {
  const live = state.habits.filter((h) => !h.archived)
  return lastNDays(days, today).map((date) => {
    const due = live.filter((h) => habitDueOn(h, date))
    const done = due.filter((h) => habitDoneOn(h, date))
    const daySessions = state.sessions.filter((s) => s.date === date)
    return {
      date,
      tasksDone: countTasksDoneOn(state.tasks, date),
      habitsDue: due.length,
      habitsDone: done.length,
      habitRatio: due.length ? done.length / due.length : 0,
      focusMinutes: daySessions.reduce((sum, s) => sum + s.actualMinutes, 0),
      sessions: daySessions.length,
    }
  })
}

export interface RangeSummary {
  tasksDone: number
  focusMinutes: number
  sessions: number
  habitRatio: number
  activeDays: number
  avgTasksPerDay: number
}

export function summarize(series: DayPoint[]): RangeSummary {
  const tasksDone = series.reduce((s, d) => s + d.tasksDone, 0)
  const focusMinutes = series.reduce((s, d) => s + d.focusMinutes, 0)
  const sessions = series.reduce((s, d) => s + d.sessions, 0)
  const withHabits = series.filter((d) => d.habitsDue > 0)
  const habitRatio = withHabits.length
    ? withHabits.reduce((s, d) => s + d.habitRatio, 0) / withHabits.length
    : 0
  const activeDays = series.filter((d) => d.tasksDone > 0 || d.focusMinutes > 0).length
  return {
    tasksDone,
    focusMinutes,
    sessions,
    habitRatio,
    activeDays,
    avgTasksPerDay: series.length ? tasksDone / series.length : 0,
  }
}

/** Percent change between the trailing half and the leading half of a series. */
export function trendDelta(series: DayPoint[], pick: (d: DayPoint) => number): number | null {
  if (series.length < 4) return null
  const mid = Math.floor(series.length / 2)
  const older = series.slice(0, mid).reduce((s, d) => s + pick(d), 0)
  const newer = series.slice(mid).reduce((s, d) => s + pick(d), 0)
  if (older === 0) return newer === 0 ? 0 : 100
  return Math.round(((newer - older) / older) * 100)
}

export interface ProductivityPeak {
  /** Weekday index, 0 = Sunday. The screen formats it in the active locale. */
  weekdayIndex: number
  weekdayCount: number
  hourLabel: string
  hourCount: number
}

/** Most productive weekday and time-of-day window across the last 30 days. */
export function productivityPeak(state: AppState, today: ISODate = todayISO()): ProductivityPeak | null {
  const window = new Set(lastNDays(30, today))
  const byWeekday = new Array(7).fill(0)
  const byHour = new Array(24).fill(0)
  let total = 0

  for (const task of state.tasks) {
    if (!task.completedAt) continue
    const iso = localDateOf(task.completedAt)
    if (!window.has(iso)) continue
    const d = new Date(task.completedAt)
    byWeekday[d.getDay()] += 1
    byHour[d.getHours()] += 1
    total += 1
  }
  for (const s of state.sessions) {
    if (!window.has(s.date)) continue
    const d = new Date(s.startedAt)
    byWeekday[d.getDay()] += 1
    byHour[d.getHours()] += 1
    total += 1
  }

  if (total === 0) return null

  const bestDay = byWeekday.indexOf(Math.max(...byWeekday))

  // Pick the strongest 3-hour window rather than a single spiky hour.
  let bestStart = 0
  let bestCount = -1
  for (let h = 0; h <= 21; h++) {
    const count = byHour[h] + byHour[h + 1] + byHour[h + 2]
    if (count > bestCount) {
      bestCount = count
      bestStart = h
    }
  }
  const fmt = (h: number) => {
    const d = new Date(2000, 0, 1, h, 0)
    return d.toLocaleTimeString(activeLocale(), { hour: 'numeric' })
  }

  return {
    weekdayIndex: bestDay,
    weekdayCount: byWeekday[bestDay],
    hourLabel: `${fmt(bestStart)} - ${fmt(bestStart + 3)}`,
    hourCount: bestCount,
  }
}

export function categoryBreakdown(
  state: AppState,
  days: number,
  today: ISODate = todayISO(),
): Array<{ category: CategoryKey; count: number }> {
  const window = new Set(lastNDays(days, today))
  const counts = new Map<CategoryKey, number>()
  for (const task of state.tasks) {
    if (!task.completedAt) continue
    if (!window.has(localDateOf(task.completedAt))) continue
    counts.set(task.category, (counts.get(task.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}
