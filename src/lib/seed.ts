import type {
  AppState,
  EnergyPattern,
  FocusSession,
  Goal,
  Habit,
  HabitFrequency,
  ISODate,
  Language,
  Priority,
  Task,
  TimeBlock,
} from '@/types'
import { SCHEMA_VERSION } from './constants'
import {
  addDays,
  clockFromMinutes,
  dayOfWeek,
  fromISO,
  minutesFromClock,
  todayISO,
  weekDates,
} from './date'
import { uid } from './id'
import { seedContent, type HabitPreset } from './seedContent'

/** DayFlow solo habla español. */
export function defaultLanguage(): Language {
  return 'es'
}

export function habitPresets(lang: Language): HabitPreset[] {
  return seedContent(lang).habits
}

export const DEFAULT_HABIT_KEYS = ['move', 'read', 'deepwork', 'journal']

/** Deterministic PRNG so a fresh install always gets the same believable history. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SeedOptions {
  name: string
  primaryGoal: string
  workStart: string
  workEnd: string
  energyPattern: EnergyPattern
  habitKeys: string[]
  language: Language
}

export function defaultSeedOptions(lang: Language = defaultLanguage()): SeedOptions {
  return {
    name: 'Alex',
    primaryGoal: seedContent(lang).defaultPrimaryGoal,
    workStart: '09:00',
    workEnd: '17:30',
    energyPattern: 'morning',
    habitKeys: DEFAULT_HABIT_KEYS,
    language: lang,
  }
}

const PRIORITY_POOL: Priority[] = ['low', 'medium', 'medium', 'high', 'high', 'urgent']

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function habitHitsOn(frequency: HabitFrequency, targetDays: number[], iso: ISODate): boolean {
  const dow = dayOfWeek(iso)
  if (frequency === 'daily') return true
  if (frequency === 'weekdays') return dow >= 1 && dow <= 5
  return targetDays.includes(dow)
}

function buildHabits(rng: () => number, keys: string[], today: ISODate, lang: Language): Habit[] {
  const presets = seedContent(lang).habits
  const chosen = keys.length ? keys : DEFAULT_HABIT_KEYS
  return chosen
    .map((key) => presets.find((p) => p.key === key))
    .filter((p): p is HabitPreset => Boolean(p))
    .map((preset, index) => {
      const targetDays = [0, 1, 2, 3, 4, 5, 6]
      const consistency = 0.62 + rng() * 0.28
      const log: ISODate[] = []
      for (let i = 59; i >= 0; i--) {
        const iso = addDays(today, -i)
        if (!habitHitsOn(preset.frequency, targetDays, iso)) continue
        // Guarantee most habits carry a live streak into today, so the UI has something to show.
        const recentBoost = i <= 2 && index % 3 !== 2 ? 0.4 : 0
        if (rng() < consistency + recentBoost) log.push(iso)
      }
      return {
        id: uid('hab'),
        name: preset.name,
        description: preset.description,
        icon: preset.icon,
        color: preset.color,
        frequency: preset.frequency,
        targetDays,
        createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        archived: false,
        log,
      }
    })
}

function buildGoals(
  rng: () => number,
  primaryGoal: string,
  today: ISODate,
  lang: Language,
): Goal[] {
  const c = seedContent(lang).goals

  const mk = (
    seed: { title: string; description: string; milestones: string[] },
    category: Goal['category'],
    color: Goal['color'],
    targetOffset: number,
    status: Goal['status'],
    doneCount: number,
    offsets: number[],
    titleOverride?: string,
  ): Goal => ({
    id: uid('goal'),
    title: titleOverride ?? seed.title,
    description: seed.description,
    category,
    color,
    targetDate: addDays(today, targetOffset),
    status,
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    milestones: seed.milestones.map((title, i) => ({
      id: uid('ms'),
      title,
      done: i < doneCount,
      targetDate: addDays(today, offsets[i] ?? targetOffset),
      completedAt: i < doneCount ? new Date(Date.now() - rng() * 30 * 86400000).toISOString() : null,
    })),
  })

  return [
    mk(c.project, 'work', 'indigo', 74, 'active', 2, [-30, -14, 28, 52, 74], primaryGoal.trim() || c.project.title),
    mk(c.running, 'health', 'emerald', 118, 'active', 2, [-40, -12, 40, 118]),
    mk(c.reading, 'learning', 'violet', 150, 'active', 2, [-120, -20, 70, 150]),
    mk(c.language, 'learning', 'amber', 200, 'paused', 1, [-60, 90, 200]),
    mk(c.savings, 'personal', 'teal', -6, 'completed', 3, [-180, -90, -6]),
  ]
}

/** Completion hour distribution, shaped by the user's declared energy pattern. */
function productiveHour(rng: () => number, pattern: EnergyPattern): number {
  const windows: Record<EnergyPattern, [number, number][]> = {
    morning: [
      [8, 12],
      [8, 12],
      [13, 17],
      [17, 21],
    ],
    afternoon: [
      [13, 17],
      [13, 17],
      [9, 12],
      [17, 21],
    ],
    evening: [
      [17, 22],
      [17, 22],
      [13, 17],
      [9, 12],
    ],
    steady: [
      [9, 12],
      [12, 15],
      [15, 18],
      [18, 21],
    ],
  }
  const [lo, hi] = pick(rng, windows[pattern])
  return lo + Math.floor(rng() * (hi - lo))
}

function stampOn(iso: ISODate, hour: number, minute: number): string {
  const d = fromISO(iso)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function buildTasks(
  rng: () => number,
  today: ISODate,
  goalId: string,
  pattern: EnergyPattern,
  lang: Language,
): Task[] {
  const content = seedContent(lang)
  const tasks: Task[] = []

  // Thirty days of completed history gives analytics something honest to chart.
  for (let i = 30; i >= 1; i--) {
    const iso = addDays(today, -i)
    const dow = dayOfWeek(iso)
    const weekend = dow === 0 || dow === 6
    const count = weekend ? Math.floor(rng() * 3) : 1 + Math.floor(rng() * 5)
    for (let j = 0; j < count; j++) {
      const source = pick(rng, content.history)
      const hour = productiveHour(rng, pattern)
      tasks.push({
        id: uid('task'),
        title: source.title,
        notes: '',
        status: 'done',
        priority: pick(rng, PRIORITY_POOL),
        category: source.category,
        dueDate: iso,
        dueTime: null,
        estimateMin: 15 + Math.floor(rng() * 8) * 15,
        goalId: rng() < 0.2 ? goalId : null,
        subjectId: null,
        createdAt: stampOn(addDays(iso, -1), 9, 0),
        completedAt: stampOn(iso, hour, Math.floor(rng() * 60)),
        order: j,
      })
    }
  }

  // A couple of things finished earlier today, so the Today score never starts at zero.
  for (let j = 0; j < 2; j++) {
    const source = pick(rng, content.history)
    tasks.push({
      id: uid('task'),
      title: source.title,
      notes: '',
      status: 'done',
      priority: pick(rng, PRIORITY_POOL),
      category: source.category,
      dueDate: today,
      dueTime: null,
      estimateMin: 30,
      goalId: null,
      subjectId: null,
      createdAt: stampOn(today, 8, 0),
      completedAt: stampOn(today, 9 + j, 20),
      order: j,
    })
  }

  content.live.forEach((spec, index) => {
    tasks.push({
      id: uid('task'),
      title: spec.title,
      notes: '',
      status: spec.status,
      priority: spec.priority,
      category: spec.category,
      dueDate: spec.status === 'backlog' ? null : today,
      dueTime: spec.dueTime,
      estimateMin: spec.estimateMin,
      goalId: index < 3 ? goalId : null,
      subjectId: null,
      createdAt: stampOn(addDays(today, -2), 9, index),
      completedAt: null,
      order: index,
    })
  })

  return tasks
}

interface Segment {
  minutes: number
  category: TimeBlock['category']
  title: string
  gapAfter: number
}

function weekdaySegments(rng: () => number, pattern: EnergyPattern, lang: Language): Segment[] {
  const b = seedContent(lang).blocks
  const deepA: Segment = { minutes: 120, category: 'deep_work', title: pick(rng, b.deepWork), gapAfter: 15 }
  const meeting: Segment = { minutes: 45, category: 'meeting', title: pick(rng, b.meetings), gapAfter: 30 }
  const lunch: Segment = { minutes: 45, category: 'break', title: b.lunch, gapAfter: 15 }
  const deepB: Segment = { minutes: 90, category: 'deep_work', title: pick(rng, b.deepWork), gapAfter: 15 }
  const study: Segment = { minutes: 45, category: 'study', title: pick(rng, b.study), gapAfter: 0 }

  // Front-load or back-load the heavy blocks to match the declared energy curve.
  if (pattern === 'evening' || pattern === 'afternoon') {
    return [meeting, { ...study, gapAfter: 30 }, lunch, deepA, deepB]
  }
  return [deepA, meeting, lunch, deepB, study]
}

function buildBlocks(rng: () => number, today: ISODate, opts: SeedOptions): TimeBlock[] {
  const b = seedContent(opts.language).blocks
  const blocks: TimeBlock[] = []
  const dates = weekDates(today, 1)
  const workStart = minutesFromClock(opts.workStart)
  const workEnd = minutesFromClock(opts.workEnd)

  for (const iso of dates) {
    const dow = dayOfWeek(iso)
    const past = iso < today
    if (dow === 0 || dow === 6) {
      blocks.push({
        id: uid('blk'),
        title: dow === 6 ? b.longRun : b.mobility,
        date: iso,
        start: '10:00',
        end: dow === 6 ? '11:30' : '10:45',
        category: 'exercise',
        notes: '',
        done: past,
        subjectId: null,
        examId: null,
      })
      blocks.push({
        id: uid('blk'),
        title: dow === 6 ? b.errands : b.weeklyReview,
        date: iso,
        start: '12:30',
        end: '14:00',
        category: 'personal',
        notes: dow === 0 ? b.weeklyReviewNote : '',
        done: past,
        subjectId: null,
        examId: null,
      })
      continue
    }

    let cursor = workStart
    for (const seg of weekdaySegments(rng, opts.energyPattern, opts.language)) {
      if (cursor + seg.minutes > workEnd) break
      blocks.push({
        id: uid('blk'),
        title: seg.title,
        date: iso,
        start: clockFromMinutes(cursor),
        end: clockFromMinutes(cursor + seg.minutes),
        category: seg.category,
        notes: '',
        done: past,
        subjectId: null,
        examId: null,
      })
      cursor += seg.minutes + seg.gapAfter
    }

    if (dow === 1 || dow === 3 || dow === 5) {
      const start = Math.min(workEnd + 30, 20 * 60)
      blocks.push({
        id: uid('blk'),
        title: b.gym,
        date: iso,
        start: clockFromMinutes(start),
        end: clockFromMinutes(start + 60),
        category: 'exercise',
        notes: '',
        done: past,
        subjectId: null,
        examId: null,
      })
    }
  }

  return blocks
}

function buildSessions(
  rng: () => number,
  today: ISODate,
  pattern: EnergyPattern,
  presets: number[],
): FocusSession[] {
  const sessions: FocusSession[] = []
  for (let i = 30; i >= 0; i--) {
    const iso = addDays(today, -i)
    const dow = dayOfWeek(iso)
    const weekend = dow === 0 || dow === 6
    const count = weekend ? (rng() < 0.5 ? 1 : 0) : Math.floor(rng() * 4)
    for (let j = 0; j < count; j++) {
      const planned = pick(rng, presets)
      const completed = rng() > 0.14
      const hour = productiveHour(rng, pattern)
      sessions.push({
        id: uid('foc'),
        startedAt: stampOn(iso, hour, Math.floor(rng() * 4) * 15),
        date: iso,
        plannedMinutes: planned,
        actualMinutes: completed ? planned : Math.max(5, Math.round(planned * (0.3 + rng() * 0.5))),
        completed,
        taskId: null,
        goalId: null,
        subjectId: null,
        // Session labels are only a fallback; the UI shows the linked task when there is one.
        label: 'Focus session',
      })
    }
  }
  return sessions
}

export function createSeedState(overrides: Partial<SeedOptions> = {}): AppState {
  const lang = overrides.language ?? defaultLanguage()
  const opts: SeedOptions = { ...defaultSeedOptions(lang), ...overrides, language: lang }
  const rng = mulberry32(20260824)
  const today = todayISO()
  const focusPresets = [25, 45, 60]

  const goals = buildGoals(rng, opts.primaryGoal, today, lang)
  const habits = buildHabits(rng, opts.habitKeys, today, lang)
  const tasks = buildTasks(rng, today, goals[0].id, opts.energyPattern, lang)
  const blocks = buildBlocks(rng, today, opts)
  const sessions = buildSessions(rng, today, opts.energyPattern, focusPresets)

  return {
    version: SCHEMA_VERSION,
    onboardingComplete: false,
    profile: {
      name: opts.name.trim(),
      primaryGoal: opts.primaryGoal.trim(),
      workStart: opts.workStart,
      workEnd: opts.workEnd,
      energyPattern: opts.energyPattern,
      onboardedAt: null,
    },
    settings: {
      theme: 'system',
      language: lang,
      weekStartsOn: 1,
      focusPresets,
      dailyTaskTarget: 5,
      dailyFocusTargetMin: 90,
    },
    tasks,
    habits,
    goals,
    subjects: [],
    timetable: { slots: [], termStart: null, termEnd: null, breaks: [] },
    blocks,
    sessions,
  }
}

/** State for someone who skipped onboarding and wants a clean slate. */
export function createEmptyState(lang: Language = defaultLanguage()): AppState {
  return {
    version: SCHEMA_VERSION,
    onboardingComplete: true,
    profile: {
      name: '',
      primaryGoal: '',
      workStart: '09:00',
      workEnd: '17:30',
      energyPattern: 'steady',
      onboardedAt: new Date().toISOString(),
    },
    settings: {
      theme: 'system',
      language: lang,
      weekStartsOn: 1,
      focusPresets: [25, 45, 60],
      dailyTaskTarget: 5,
      dailyFocusTargetMin: 90,
    },
    tasks: [],
    habits: [],
    goals: [],
    subjects: [],
    timetable: { slots: [], termStart: null, termEnd: null, breaks: [] },
    blocks: [],
    sessions: [],
  }
}
