import type {
  AppState,
  BreakPeriod,
  BlockCategory,
  CategoryKey,
  ClassKind,
  ClassSlot,
  ColorKey,
  EnergyPattern,
  EvalItem,
  FocusSession,
  Goal,
  GoalStatus,
  Habit,
  HabitFrequency,
  Language,
  Milestone,
  Priority,
  Settings,
  Subject,
  SubjectStatus,
  Task,
  Timetable,
  TaskStatus,
  ThemeMode,
  TimeBlock,
} from '@/types'
import {
  BLOCK_CATEGORY_KEYS,
  CLASS_KIND_KEYS,
  MAX_BREAKS,
  MAX_CLASS_SLOTS,
  CATEGORY_KEYS,
  COLOR_KEYS,
  MAX_EVAL_ITEMS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  SUBJECT_STATUS_KEYS,
} from './constants'
import { isValidClock, isValidISODate, todayISO } from './date'
import { uid } from './id'
import { createEmptyState } from './seed'

/* -------------------------------------------------------------------------- *
 * Coercion helpers. Anything reaching these came from localStorage or a
 * user-supplied JSON file, so nothing is trusted.
 * -------------------------------------------------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function nullableDate(v: unknown): string | null {
  return isValidISODate(v) ? v : null
}

function nullableClock(v: unknown): string | null {
  return isValidClock(v) ? v : null
}

function isoStamp(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

const TASK_STATUSES: TaskStatus[] = ['backlog', 'today', 'in_progress', 'done']
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const FREQUENCIES: HabitFrequency[] = ['daily', 'weekdays', 'custom']
const GOAL_STATUSES: GoalStatus[] = ['active', 'completed', 'paused']
const THEMES: ThemeMode[] = ['light', 'dark', 'system']
const LANGUAGES: Language[] = ['es']
const ENERGY: EnergyPattern[] = ['morning', 'afternoon', 'evening', 'steady']

/* -------------------------------------------------------------------------- */

function parseTask(raw: unknown, index: number): Task | null {
  if (!isRecord(raw)) return null
  const title = str(raw.title).trim()
  if (!title) return null
  const status = oneOf(raw.status, TASK_STATUSES, 'backlog')
  const completedAt = typeof raw.completedAt === 'string' ? isoStamp(raw.completedAt, '') : ''
  return {
    id: str(raw.id) || uid('task'),
    title: title.slice(0, 240),
    notes: str(raw.notes).slice(0, 4000),
    status,
    priority: oneOf(raw.priority, PRIORITIES, 'medium'),
    category: oneOf(raw.category, CATEGORY_KEYS as CategoryKey[], 'work'),
    dueDate: nullableDate(raw.dueDate),
    dueTime: nullableClock(raw.dueTime),
    estimateMin: raw.estimateMin == null ? null : num(raw.estimateMin, 30, 0, 1440),
    goalId: typeof raw.goalId === 'string' ? raw.goalId : null,
    subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : null,
    createdAt: isoStamp(raw.createdAt, new Date().toISOString()),
    // A done task with no timestamp would vanish from analytics, so backfill it.
    completedAt: status === 'done' ? completedAt || new Date().toISOString() : null,
    order: num(raw.order, index, 0, 1e9),
  }
}

function parseHabit(raw: unknown): Habit | null {
  if (!isRecord(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null
  const targetDays = arr(raw.targetDays)
    .map((d) => num(d, -1, -1, 6))
    .filter((d) => d >= 0 && Number.isInteger(d))
  const log = Array.from(new Set(arr(raw.log).filter(isValidISODate)))
    .sort()
    .reverse()
  return {
    id: str(raw.id) || uid('hab'),
    name: name.slice(0, 120),
    description: str(raw.description).slice(0, 500),
    icon: str(raw.icon, 'sprout'),
    color: oneOf(raw.color, COLOR_KEYS as ColorKey[], 'teal'),
    frequency: oneOf(raw.frequency, FREQUENCIES, 'daily'),
    targetDays: targetDays.length ? targetDays : [0, 1, 2, 3, 4, 5, 6],
    createdAt: isoStamp(raw.createdAt, new Date().toISOString()),
    archived: bool(raw.archived),
    log,
  }
}

function parseMilestone(raw: unknown): Milestone | null {
  if (!isRecord(raw)) return null
  const title = str(raw.title).trim()
  if (!title) return null
  const done = bool(raw.done)
  return {
    id: str(raw.id) || uid('ms'),
    title: title.slice(0, 200),
    done,
    targetDate: nullableDate(raw.targetDate),
    completedAt: done ? isoStamp(raw.completedAt, new Date().toISOString()) : null,
  }
}

function parseGoal(raw: unknown): Goal | null {
  if (!isRecord(raw)) return null
  const title = str(raw.title).trim()
  if (!title) return null
  return {
    id: str(raw.id) || uid('goal'),
    title: title.slice(0, 200),
    description: str(raw.description).slice(0, 2000),
    category: oneOf(raw.category, CATEGORY_KEYS as CategoryKey[], 'personal'),
    color: oneOf(raw.color, COLOR_KEYS as ColorKey[], 'indigo'),
    targetDate: nullableDate(raw.targetDate) ?? todayISO(),
    status: oneOf(raw.status, GOAL_STATUSES, 'active'),
    milestones: arr(raw.milestones)
      .map(parseMilestone)
      .filter((m): m is Milestone => m !== null),
    createdAt: isoStamp(raw.createdAt, new Date().toISOString()),
  }
}

/** Solo http(s): un `javascript:` pegado en este campo acabaría en un href. */
function safeLink(v: unknown): string {
  const raw = str(v).trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().slice(0, 500) : ''
  } catch {
    return ''
  }
}

/** Redondea a 2 decimales: las notas llevan como mucho céntimos. */
const round2 = (n: number) => Math.round(n * 100) / 100

const EXAM_NAME = /exam|parcial|final|test|control|prueba/i

function parseEvalItem(raw: unknown): EvalItem | null {
  if (!isRecord(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null
  const weight = num(raw.weight, 0, 0, 100)
  // Una parte sin peso no cuenta para nada: se descarta en vez de ensuciar las cuentas.
  if (weight <= 0) return null
  return {
    id: str(raw.id) || uid('ev'),
    name: name.slice(0, 80),
    weight: round2(weight),
    grade: raw.grade == null || raw.grade === '' ? null : round2(num(raw.grade, 0, 0, 10)),
    minGrade: raw.minGrade == null || raw.minGrade === '' ? null : round2(num(raw.minGrade, 0, 0, 10)),
    date: nullableDate(raw.date),
    // Los datos anteriores a los exámenes no traen el campo: se deduce del nombre.
    exam: typeof raw.exam === 'boolean' ? raw.exam : EXAM_NAME.test(name),
    time: nullableClock(raw.time),
    room: str(raw.room).trim().slice(0, 40),
  }
}

function parseSubject(raw: unknown): Subject | null {
  if (!isRecord(raw)) return null
  const name = str(raw.name).trim()
  if (!name) return null
  return {
    id: str(raw.id) || uid('sub'),
    name: name.slice(0, 120),
    code: str(raw.code).trim().slice(0, 10),
    color: oneOf(raw.color, COLOR_KEYS as ColorKey[], 'indigo'),
    credits: Math.round(num(raw.credits, 0, 0, 60) * 2) / 2,
    term: str(raw.term).trim().slice(0, 40),
    status: oneOf<SubjectStatus>(raw.status, SUBJECT_STATUS_KEYS, 'active'),
    professor: str(raw.professor).trim().slice(0, 120),
    room: str(raw.room).trim().slice(0, 60),
    link: safeLink(raw.link),
    notes: str(raw.notes).slice(0, 2000),
    evaluation: arr(raw.evaluation)
      .map(parseEvalItem)
      .filter((e): e is EvalItem => e !== null)
      .slice(0, MAX_EVAL_ITEMS),
    createdAt: isoStamp(raw.createdAt, new Date().toISOString()),
  }
}

function parseSlot(raw: unknown, subjectIds: Set<string>): ClassSlot | null {
  if (!isRecord(raw)) return null
  const subjectId = str(raw.subjectId)
  const weekday = Number(raw.weekday)
  const start = nullableClock(raw.start)
  const end = nullableClock(raw.end)
  if (!subjectIds.has(subjectId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
  if (!start || !end || end <= start) return null
  return {
    id: str(raw.id) || uid('cls'),
    subjectId,
    weekday,
    start,
    end,
    kind: oneOf<ClassKind>(raw.kind, CLASS_KIND_KEYS, 'theory'),
    room: str(raw.room).trim().slice(0, 40),
  }
}

function parseBreak(raw: unknown): BreakPeriod | null {
  if (!isRecord(raw)) return null
  const from = nullableDate(raw.from)
  const to = nullableDate(raw.to)
  if (!from || !to || to < from) return null
  return { id: str(raw.id) || uid('brk'), label: str(raw.label).trim().slice(0, 60), from, to }
}

function parseTimetable(raw: unknown, subjectIds: Set<string>): Timetable {
  const src = isRecord(raw) ? raw : {}
  let termStart = nullableDate(src.termStart)
  let termEnd = nullableDate(src.termEnd)
  // Un periodo al revés no tiene sentido: se descarta entero en vez de adivinar.
  if (termStart && termEnd && termEnd < termStart) {
    termStart = null
    termEnd = null
  }
  return {
    slots: arr(src.slots)
      .map((s) => parseSlot(s, subjectIds))
      .filter((s): s is ClassSlot => s !== null)
      .slice(0, MAX_CLASS_SLOTS),
    termStart,
    termEnd,
    breaks: arr(src.breaks)
      .map(parseBreak)
      .filter((b): b is BreakPeriod => b !== null)
      .slice(0, MAX_BREAKS),
  }
}

function parseBlock(raw: unknown): TimeBlock | null {
  if (!isRecord(raw)) return null
  const title = str(raw.title).trim()
  const date = nullableDate(raw.date)
  const start = nullableClock(raw.start)
  const end = nullableClock(raw.end)
  if (!title || !date || !start || !end || end <= start) return null
  return {
    id: str(raw.id) || uid('blk'),
    title: title.slice(0, 200),
    date,
    start,
    end,
    category: oneOf(raw.category, BLOCK_CATEGORY_KEYS as BlockCategory[], 'deep_work'),
    notes: str(raw.notes).slice(0, 2000),
    done: bool(raw.done),
    subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : null,
    examId: typeof raw.examId === 'string' ? raw.examId : null,
  }
}

function parseSession(raw: unknown): FocusSession | null {
  if (!isRecord(raw)) return null
  const date = nullableDate(raw.date)
  if (!date) return null
  const planned = num(raw.plannedMinutes, 25, 1, 480)
  return {
    id: str(raw.id) || uid('foc'),
    startedAt: isoStamp(raw.startedAt, new Date().toISOString()),
    date,
    plannedMinutes: planned,
    actualMinutes: num(raw.actualMinutes, planned, 0, 480),
    completed: bool(raw.completed, true),
    taskId: typeof raw.taskId === 'string' ? raw.taskId : null,
    goalId: typeof raw.goalId === 'string' ? raw.goalId : null,
    subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : null,
    label: str(raw.label, 'Focus session').slice(0, 200),
  }
}

function parseSettings(raw: unknown): Settings {
  const base = createEmptyState().settings
  if (!isRecord(raw)) return base
  const presets = arr(raw.focusPresets)
    .map((p) => Math.round(num(p, 0, 0, 240)))
    .filter((p) => p > 0)
  return {
    theme: oneOf(raw.theme, THEMES, base.theme),
    language: oneOf(raw.language, LANGUAGES, base.language),
    weekStartsOn: num(raw.weekStartsOn, base.weekStartsOn, 0, 1) === 0 ? 0 : 1,
    focusPresets: presets.length
      ? Array.from(new Set(presets)).sort((a, b) => a - b)
      : base.focusPresets,
    dailyTaskTarget: Math.round(num(raw.dailyTaskTarget, base.dailyTaskTarget, 1, 50)),
    dailyFocusTargetMin: Math.round(num(raw.dailyFocusTargetMin, base.dailyFocusTargetMin, 5, 720)),
  }
}

/**
 * Turns arbitrary JSON into a usable AppState, dropping anything malformed.
 * Returns null only when the payload is not an object at all.
 */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isRecord(raw)) return null
  const empty = createEmptyState()
  const profileRaw = isRecord(raw.profile) ? raw.profile : {}

  const goals = arr(raw.goals)
    .map(parseGoal)
    .filter((g): g is Goal => g !== null)
  const goalIds = new Set(goals.map((g) => g.id))

  const subjects = arr(raw.subjects)
    .map(parseSubject)
    .filter((s): s is Subject => s !== null)
  const subjectIds = new Set(subjects.map((s) => s.id))
  const knownSubject = (id: string | null) => (id && subjectIds.has(id) ? id : null)
  const evalIds = new Set(subjects.flatMap((s) => s.evaluation.map((e) => e.id)))

  const tasks = arr(raw.tasks)
    .map(parseTask)
    .filter((t): t is Task => t !== null)
    // Drop dangling goal links rather than rendering a broken reference.
    .map((t) => ({
      ...t,
      goalId: t.goalId && !goalIds.has(t.goalId) ? null : t.goalId,
      subjectId: knownSubject(t.subjectId),
    }))

  const taskIds = new Set(tasks.map((t) => t.id))

  return {
    version: SCHEMA_VERSION,
    onboardingComplete: bool(raw.onboardingComplete, false),
    profile: {
      name: str(profileRaw.name).slice(0, 80),
      primaryGoal: str(profileRaw.primaryGoal).slice(0, 300),
      workStart: isValidClock(profileRaw.workStart) ? profileRaw.workStart : empty.profile.workStart,
      workEnd: isValidClock(profileRaw.workEnd) ? profileRaw.workEnd : empty.profile.workEnd,
      energyPattern: oneOf(profileRaw.energyPattern, ENERGY, 'steady'),
      onboardedAt:
        typeof profileRaw.onboardedAt === 'string'
          ? isoStamp(profileRaw.onboardedAt, new Date().toISOString())
          : null,
    },
    settings: parseSettings(raw.settings),
    tasks,
    habits: arr(raw.habits)
      .map(parseHabit)
      .filter((h): h is Habit => h !== null),
    goals,
    subjects,
    timetable: parseTimetable(raw.timetable, subjectIds),
    blocks: arr(raw.blocks)
      .map(parseBlock)
      .filter((b): b is TimeBlock => b !== null)
      .map((b) => ({
        ...b,
        subjectId: knownSubject(b.subjectId),
        // Un plan cuyo examen ya no existe deja bloques normales, no huérfanos.
        examId: b.examId && evalIds.has(b.examId) ? b.examId : null,
      })),
    sessions: arr(raw.sessions)
      .map(parseSession)
      .filter((s): s is FocusSession => s !== null)
      .map((s) => ({
        ...s,
        taskId: s.taskId && !taskIds.has(s.taskId) ? null : s.taskId,
        goalId: s.goalId && !goalIds.has(s.goalId) ? null : s.goalId,
        subjectId: knownSubject(s.subjectId),
      })),
  }
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return sanitizeState(JSON.parse(raw))
  } catch {
    // Corrupt payload: fall back to a fresh install rather than crashing on boot.
    return null
  }
}

let writeTimer: number | undefined

/** Debounced so dragging or typing does not hammer localStorage. */
export function saveState(state: AppState): void {
  if (writeTimer !== undefined) clearTimeout(writeTimer)
  writeTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (err) {
      console.warn('DayFlow could not persist to localStorage.', err)
    }
  }, 180)
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing sensible to do here */
  }
}

export function serializeState(state: AppState): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)
}
