import {
  Apple,
  Bike,
  BookOpen,
  Brain,
  Camera,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Footprints,
  Heart,
  Languages,
  Moon,
  Music,
  PenLine,
  Sprout,
  Sun,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/i18n/es'
import type {
  BlockCategory,
  CategoryKey,
  ClassKind,
  ColorKey,
  EnergyPattern,
  Priority,
  SubjectStatus,
  TaskStatus,
} from '@/types'

/**
 * Metadata holds translation keys rather than copy, so every label follows the
 * active language without each screen having to special-case it.
 */
export interface Meta {
  labelKey: TranslationKey
  color: ColorKey
}

export const CATEGORIES: Record<CategoryKey, Meta> = {
  work: { labelKey: 'category.work', color: 'indigo' },
  personal: { labelKey: 'category.personal', color: 'teal' },
  health: { labelKey: 'category.health', color: 'emerald' },
  learning: { labelKey: 'category.learning', color: 'violet' },
  admin: { labelKey: 'category.admin', color: 'slate' },
  creative: { labelKey: 'category.creative', color: 'rose' },
}

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[]

export const PRIORITIES: Record<Priority, Meta & { weight: number }> = {
  urgent: { labelKey: 'priority.urgent', color: 'rose', weight: 4 },
  high: { labelKey: 'priority.high', color: 'amber', weight: 3 },
  medium: { labelKey: 'priority.medium', color: 'sky', weight: 2 },
  low: { labelKey: 'priority.low', color: 'slate', weight: 1 },
}

export const PRIORITY_KEYS = ['urgent', 'high', 'medium', 'low'] as Priority[]

export const STATUSES: Record<TaskStatus, { labelKey: TranslationKey; hintKey: TranslationKey }> = {
  backlog: { labelKey: 'status.backlog', hintKey: 'status.backlogHint' },
  today: { labelKey: 'status.today', hintKey: 'status.todayHint' },
  in_progress: { labelKey: 'status.in_progress', hintKey: 'status.in_progressHint' },
  done: { labelKey: 'status.done', hintKey: 'status.doneHint' },
}

export const STATUS_ORDER: TaskStatus[] = ['backlog', 'today', 'in_progress', 'done']

export const BLOCK_CATEGORIES: Record<BlockCategory, Meta> = {
  deep_work: { labelKey: 'block.deep_work', color: 'indigo' },
  meeting: { labelKey: 'block.meeting', color: 'sky' },
  exercise: { labelKey: 'block.exercise', color: 'emerald' },
  personal: { labelKey: 'block.personal', color: 'teal' },
  study: { labelKey: 'block.study', color: 'violet' },
  break: { labelKey: 'block.break', color: 'amber' },
}

export const BLOCK_CATEGORY_KEYS = Object.keys(BLOCK_CATEGORIES) as BlockCategory[]

export const COLOR_KEYS: ColorKey[] = [
  'violet',
  'teal',
  'amber',
  'rose',
  'sky',
  'emerald',
  'indigo',
  'slate',
]

/** Resolves to a themed CSS variable so charts and dots follow light/dark. */
export function colorVar(color: ColorKey): string {
  return `var(--cat-${color})`
}

export const HABIT_ICONS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  book: BookOpen,
  water: Droplets,
  moon: Moon,
  sun: Sun,
  brain: Brain,
  heart: Heart,
  steps: Footprints,
  apple: Apple,
  coffee: Coffee,
  write: PenLine,
  music: Music,
  code: Code,
  sprout: Sprout,
  bike: Bike,
  wallet: Wallet,
  language: Languages,
  camera: Camera,
}

export const HABIT_ICON_KEYS = Object.keys(HABIT_ICONS)

export function habitIcon(key: string): LucideIcon {
  return HABIT_ICONS[key] ?? Sprout
}

export const ENERGY_PATTERNS: Array<{
  value: EnergyPattern
  labelKey: TranslationKey
  hintKey: TranslationKey
}> = [
  { value: 'morning', labelKey: 'energy.morning', hintKey: 'energy.morningHint' },
  { value: 'afternoon', labelKey: 'energy.afternoon', hintKey: 'energy.afternoonHint' },
  { value: 'evening', labelKey: 'energy.evening', hintKey: 'energy.eveningHint' },
  { value: 'steady', labelKey: 'energy.steady', hintKey: 'energy.steadyHint' },
]

export const SUBJECT_STATUSES: Record<SubjectStatus, Meta> = {
  active: { labelKey: 'subjects.statusActive', color: 'sky' },
  recovery: { labelKey: 'subjects.statusRecovery', color: 'amber' },
  passed: { labelKey: 'subjects.statusPassed', color: 'emerald' },
  failed: { labelKey: 'subjects.statusFailed', color: 'rose' },
}

export const SUBJECT_STATUS_KEYS = Object.keys(SUBJECT_STATUSES) as SubjectStatus[]

export const CLASS_KINDS: Record<ClassKind, { labelKey: TranslationKey }> = {
  theory: { labelKey: 'timetable.kindTheory' },
  practice: { labelKey: 'timetable.kindPractice' },
  lab: { labelKey: 'timetable.kindLab' },
  seminar: { labelKey: 'timetable.kindSeminar' },
  other: { labelKey: 'timetable.kindOther' },
}

export const CLASS_KIND_KEYS = Object.keys(CLASS_KINDS) as ClassKind[]

/** Topes para que un archivo importado a mano no pueda inflar el estado. */
export const MAX_CLASS_SLOTS = 80
export const MAX_BREAKS = 40

/** Tope de partes de evaluación por asignatura. */
export const MAX_EVAL_ITEMS = 20

export const STORAGE_KEY = 'dayflow.state.v1'
export const SCHEMA_VERSION = 1
