/** Canonical DayFlow data model. Every persisted entity lives here. */

/** `YYYY-MM-DD`, always interpreted in the user's local timezone. */
export type ISODate = string
/** Full ISO timestamp produced by `new Date().toISOString()`. */
export type ISODateTime = string
/** `HH:MM` in 24h time. */
export type Clock = string

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'backlog' | 'today' | 'in_progress' | 'done'
export type CategoryKey = 'work' | 'personal' | 'health' | 'learning' | 'admin' | 'creative'
export type ColorKey = 'violet' | 'teal' | 'amber' | 'rose' | 'sky' | 'emerald' | 'indigo' | 'slate'
export type BlockCategory = 'deep_work' | 'meeting' | 'exercise' | 'personal' | 'study' | 'break'
export type HabitFrequency = 'daily' | 'weekdays' | 'custom'
export type ClassKind = 'theory' | 'practice' | 'lab' | 'seminar' | 'other'
export type GoalStatus = 'active' | 'completed' | 'paused'
/** Cursando, pendiente de recuperación, aprobada o suspensa. */
export type SubjectStatus = 'active' | 'recovery' | 'passed' | 'failed'
export type ThemeMode = 'light' | 'dark' | 'system'
/** DayFlow es una app en español. El campo se conserva por compatibilidad. */
export type Language = 'es'
export type EnergyPattern = 'morning' | 'afternoon' | 'evening' | 'steady'

export interface Task {
  id: string
  title: string
  notes: string
  status: TaskStatus
  priority: Priority
  category: CategoryKey
  dueDate: ISODate | null
  dueTime: Clock | null
  estimateMin: number | null
  goalId: string | null
  /** Asignatura a la que pertenece la tarea, si es académica. */
  subjectId: string | null
  createdAt: ISODateTime
  completedAt: ISODateTime | null
  /** Sort position within a status column. Lower comes first. */
  order: number
}

export interface Habit {
  id: string
  name: string
  description: string
  icon: string
  color: ColorKey
  frequency: HabitFrequency
  /** Day indexes 0=Sunday … 6=Saturday. Only meaningful for `custom`. */
  targetDays: number[]
  createdAt: ISODateTime
  archived: boolean
  /** Sorted-descending list of dates the habit was completed. */
  log: ISODate[]
}

export interface Milestone {
  id: string
  title: string
  done: boolean
  targetDate: ISODate | null
  completedAt: ISODateTime | null
}

export interface Goal {
  id: string
  title: string
  description: string
  category: CategoryKey
  color: ColorKey
  targetDate: ISODate
  status: GoalStatus
  milestones: Milestone[]
  createdAt: ISODateTime
}

export interface TimeBlock {
  id: string
  title: string
  date: ISODate
  start: Clock
  end: Clock
  category: BlockCategory
  notes: string
  done: boolean
  subjectId: string | null
  /** Parte de evaluación (examen) para la que un plan de estudio creó este bloque. */
  examId: string | null
}

export interface FocusSession {
  id: string
  startedAt: ISODateTime
  date: ISODate
  /** Length the user selected, in minutes. */
  plannedMinutes: number
  /** Minutes actually spent before finishing or stopping. */
  actualMinutes: number
  completed: boolean
  taskId: string | null
  goalId: string | null
  subjectId: string | null
  label: string
}

/** Una parte de la evaluación: un parcial, unas prácticas, el examen final… */
export interface EvalItem {
  id: string
  name: string
  /** Peso en % sobre la nota final. Si los pesos no suman 100 se calcula en proporción. */
  weight: number
  /** Nota de 0 a 10, o null si todavía no se conoce. */
  grade: number | null
  /** Nota mínima para que la parte haga media, o null si no hay. */
  minGrade: number | null
  /** Fecha del examen o de la entrega, si la hay. */
  date: ISODate | null
  /** Es un examen: sale en Exámenes y admite plan de estudio. */
  exam: boolean
  /** Hora del examen, si se sabe. */
  time: Clock | null
  /** Aula del examen, si se sabe. */
  room: string
}

export interface Subject {
  id: string
  name: string
  /** Siglas cortas (p. ej. "SI"), usadas donde no cabe el nombre entero. */
  code: string
  color: ColorKey
  /** Créditos ECTS. 0 si aún no se sabe. */
  credits: number
  /** Texto libre: "Semestre A", "Anual"… Agrupa las asignaturas en la lista. */
  term: string
  status: SubjectStatus
  professor: string
  room: string
  /** Enlace http(s) al aula virtual (PoliformaT). Vacío si no hay. */
  link: string
  notes: string
  /** Partes de la evaluación, definidas por el usuario. */
  evaluation: EvalItem[]
  createdAt: ISODateTime
}

/** Una clase que se repite cada semana en un día y una franja fija. */
export interface ClassSlot {
  id: string
  subjectId: string
  /** 0 = domingo … 6 = sábado, igual que en el resto de la app. */
  weekday: number
  start: Clock
  end: Clock
  kind: ClassKind
  room: string
}

/** Festivos, vacaciones o semanas sin clase. Ambos extremos incluidos. */
export interface BreakPeriod {
  id: string
  label: string
  from: ISODate
  to: ISODate
}

export interface Timetable {
  slots: ClassSlot[]
  /** Primer y último día de clase; fuera de ese rango las clases no se repiten. */
  termStart: ISODate | null
  termEnd: ISODate | null
  breaks: BreakPeriod[]
}

export interface Profile {
  name: string
  primaryGoal: string
  workStart: Clock
  workEnd: Clock
  energyPattern: EnergyPattern
  onboardedAt: ISODateTime | null
}

export interface Settings {
  theme: ThemeMode
  language: Language
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
  focusPresets: number[]
  dailyTaskTarget: number
  dailyFocusTargetMin: number
}

export interface AppState {
  version: number
  onboardingComplete: boolean
  profile: Profile
  settings: Settings
  tasks: Task[]
  habits: Habit[]
  goals: Goal[]
  subjects: Subject[]
  timetable: Timetable
  blocks: TimeBlock[]
  sessions: FocusSession[]
}
