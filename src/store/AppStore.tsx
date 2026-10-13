import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppState,
  FocusSession,
  Goal,
  Habit,
  ISODate,
  Milestone,
  Profile,
  Settings,
  Subject,
  Task,
  Timetable,
  TaskStatus,
  TimeBlock,
} from '@/types'
import { todayISO } from '@/lib/date'
import { uid } from '@/lib/id'
import { clearState, loadState, saveState } from '@/lib/storage'
import { createEmptyState, createSeedState, type SeedOptions } from '@/lib/seed'

/** How a finished onboarding run treats whatever data already exists. */
export type OnboardingMode = 'demo' | 'empty' | 'keep'

/* --------------------------------- actions -------------------------------- */

export type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'finishOnboarding'; options: SeedOptions; mode: OnboardingMode }
  | { type: 'restartOnboarding' }
  | { type: 'patchProfile'; patch: Partial<Profile> }
  | { type: 'patchSettings'; patch: Partial<Settings> }
  | { type: 'addTask'; task: Task }
  | { type: 'patchTask'; id: string; patch: Partial<Task> }
  | { type: 'deleteTask'; id: string }
  | { type: 'toggleTask'; id: string }
  | { type: 'moveTask'; id: string; status: TaskStatus; index?: number }
  | { type: 'addHabit'; habit: Habit }
  | { type: 'patchHabit'; id: string; patch: Partial<Habit> }
  | { type: 'deleteHabit'; id: string }
  | { type: 'toggleHabitDay'; id: string; date: ISODate }
  | { type: 'addGoal'; goal: Goal }
  | { type: 'patchGoal'; id: string; patch: Partial<Goal> }
  | { type: 'deleteGoal'; id: string }
  | { type: 'addMilestone'; goalId: string; milestone: Milestone }
  | { type: 'patchMilestone'; goalId: string; milestoneId: string; patch: Partial<Milestone> }
  | { type: 'toggleMilestone'; goalId: string; milestoneId: string }
  | { type: 'deleteMilestone'; goalId: string; milestoneId: string }
  | { type: 'addSubject'; subject: Subject }
  | { type: 'patchSubject'; id: string; patch: Partial<Subject> }
  | { type: 'deleteSubject'; id: string }
  | { type: 'patchTimetable'; patch: Partial<Timetable> }
  | { type: 'addBlock'; block: TimeBlock }
  | { type: 'applyStudyPlan'; examId: string; from: ISODate; blocks: TimeBlock[] }
  | { type: 'deleteStudyPlan'; examId: string; from: ISODate }
  | { type: 'patchBlock'; id: string; patch: Partial<TimeBlock> }
  | { type: 'deleteBlock'; id: string }
  | { type: 'addSession'; session: FocusSession }

/* --------------------------------- reducer -------------------------------- */

const byOrder = (a: Task, b: Task) => a.order - b.order

/** Recomputes contiguous order values for one status column. */
function resequence(tasks: Task[], status: TaskStatus): Task[] {
  let n = 0
  const ordered = tasks.filter((t) => t.status === status).sort(byOrder)
  const orderById = new Map(ordered.map((t) => [t.id, n++]))
  return tasks.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id) as number } : t))
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'replace':
      return action.state

    case 'finishOnboarding': {
      const profile: Profile = {
        name: action.options.name.trim(),
        primaryGoal: action.options.primaryGoal.trim(),
        workStart: action.options.workStart,
        workEnd: action.options.workEnd,
        energyPattern: action.options.energyPattern,
        onboardedAt: new Date().toISOString(),
      }
      // 'keep' is what a returning user gets: new answers, existing data intact.
      if (action.mode === 'keep') {
        return { ...state, onboardingComplete: true, profile }
      }
      const base = action.mode === 'demo' ? createSeedState(action.options) : createEmptyState()
      return {
        ...base,
        onboardingComplete: true,
        settings: { ...base.settings, ...state.settings },
        profile,
      }
    }

    case 'restartOnboarding':
      return { ...state, onboardingComplete: false }

    case 'patchProfile':
      return { ...state, profile: { ...state.profile, ...action.patch } }

    case 'patchSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'addTask': {
      const siblings = state.tasks.filter((t) => t.status === action.task.status)
      const order = siblings.length ? Math.min(...siblings.map((t) => t.order)) - 1 : 0
      return { ...state, tasks: [{ ...action.task, order }, ...state.tasks] }
    }

    case 'patchTask':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      }

    case 'deleteTask':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        sessions: state.sessions.map((s) => (s.taskId === action.id ? { ...s, taskId: null } : s)),
      }

    case 'toggleTask':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t
          if (t.status === 'done') {
            // Un-completing returns the task to the day's working list.
            return { ...t, status: 'today', completedAt: null }
          }
          return { ...t, status: 'done', completedAt: new Date().toISOString() }
        }),
      }

    case 'moveTask': {
      const moving = state.tasks.find((t) => t.id === action.id)
      if (!moving) return state

      const updated: Task = {
        ...moving,
        status: action.status,
        completedAt:
          action.status === 'done'
            ? (moving.completedAt ?? new Date().toISOString())
            : null,
        dueDate:
          action.status === 'today' && !moving.dueDate ? todayISO() : moving.dueDate,
      }

      const column = state.tasks
        .filter((t) => t.status === action.status && t.id !== action.id)
        .sort(byOrder)
      const at = Math.max(0, Math.min(action.index ?? column.length, column.length))
      column.splice(at, 0, updated)

      const orderById = new Map(column.map((t, i) => [t.id, i]))
      const next = state.tasks.map((t) => {
        if (t.id === action.id) return { ...updated, order: orderById.get(t.id) ?? 0 }
        if (orderById.has(t.id)) return { ...t, order: orderById.get(t.id) as number }
        return t
      })
      return { ...state, tasks: resequence(next, moving.status) }
    }

    case 'addHabit':
      return { ...state, habits: [...state.habits, action.habit] }

    case 'patchHabit':
      return {
        ...state,
        habits: state.habits.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)),
      }

    case 'deleteHabit':
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id) }

    case 'toggleHabitDay':
      return {
        ...state,
        habits: state.habits.map((h) => {
          if (h.id !== action.id) return h
          const has = h.log.includes(action.date)
          const log = has
            ? h.log.filter((d) => d !== action.date)
            : [action.date, ...h.log].sort().reverse()
          return { ...h, log }
        }),
      }

    case 'addGoal':
      return { ...state, goals: [action.goal, ...state.goals] }

    case 'patchGoal':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }

    case 'deleteGoal':
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        tasks: state.tasks.map((t) => (t.goalId === action.id ? { ...t, goalId: null } : t)),
        sessions: state.sessions.map((s) => (s.goalId === action.id ? { ...s, goalId: null } : s)),
      }

    case 'addMilestone':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId ? { ...g, milestones: [...g.milestones, action.milestone] } : g,
        ),
      }

    case 'patchMilestone':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? {
                ...g,
                milestones: g.milestones.map((m) =>
                  m.id === action.milestoneId ? { ...m, ...action.patch } : m,
                ),
              }
            : g,
        ),
      }

    case 'toggleMilestone': {
      return {
        ...state,
        goals: state.goals.map((g) => {
          if (g.id !== action.goalId) return g
          const milestones = g.milestones.map((m) =>
            m.id === action.milestoneId
              ? { ...m, done: !m.done, completedAt: m.done ? null : new Date().toISOString() }
              : m,
          )
          // Finishing the last milestone completes the goal; reopening one revives it.
          const allDone = milestones.length > 0 && milestones.every((m) => m.done)
          let status = g.status
          if (allDone && g.status === 'active') status = 'completed'
          if (!allDone && g.status === 'completed') status = 'active'
          return { ...g, milestones, status }
        }),
      }
    }

    case 'deleteMilestone':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.goalId
            ? { ...g, milestones: g.milestones.filter((m) => m.id !== action.milestoneId) }
            : g,
        ),
      }

    case 'addSubject':
      return { ...state, subjects: [...state.subjects, action.subject] }

    case 'patchSubject':
      return {
        ...state,
        subjects: state.subjects.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      }

    // Borrar una asignatura nunca borra su trabajo: tareas, bloques y sesiones
    // se quedan, solo pierden el vínculo.
    case 'deleteSubject': {
      const unlink = <T extends { subjectId: string | null }>(item: T): T =>
        item.subjectId === action.id ? { ...item, subjectId: null } : item
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        // Una clase sin asignatura no tiene sentido: se va con ella.
        timetable: {
          ...state.timetable,
          slots: state.timetable.slots.filter((s) => s.subjectId !== action.id),
        },
        tasks: state.tasks.map(unlink),
        blocks: state.blocks.map(unlink),
        sessions: state.sessions.map(unlink),
      }
    }

    case 'patchTimetable':
      return { ...state, timetable: { ...state.timetable, ...action.patch } }

    case 'addBlock':
      return { ...state, blocks: [...state.blocks, action.block] }

    case 'patchBlock':
      return {
        ...state,
        blocks: state.blocks.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
      }

    case 'deleteBlock':
      return { ...state, blocks: state.blocks.filter((b) => b.id !== action.id) }

    // Rehacer un plan sustituye las sesiones pendientes de ese examen; las ya
    // hechas son historia y se conservan.
    case 'applyStudyPlan': {
      const kept = state.blocks.filter(
        (b) => !(b.examId === action.examId && !b.done && b.date >= action.from),
      )
      return { ...state, blocks: [...kept, ...action.blocks] }
    }

    case 'deleteStudyPlan':
      return {
        ...state,
        blocks: state.blocks.filter(
          (b) => !(b.examId === action.examId && !b.done && b.date >= action.from),
        ),
      }

    case 'addSession':
      return { ...state, sessions: [action.session, ...state.sessions] }

    default:
      return state
  }
}

/* --------------------------------- context -------------------------------- */

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  /** Replaces everything, e.g. after an import or a demo-data reset. */
  replaceState: (next: AppState) => void
  resetDemoData: () => void
  hardReset: () => void
  today: ISODate
}

const AppContext = createContext<AppContextValue | null>(null)

function initialState(): AppState {
  const stored = loadState()
  if (stored) return stored
  // First run: seed demo content but hold onboarding open on top of it.
  return createSeedState()
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // Keep "today" fresh for long-lived tabs left open across midnight.
  const [today, setToday] = useState<ISODate>(todayISO)
  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = todayISO()
      setToday((prev) => (prev === now ? prev : now))
    }, 60_000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  const replaceState = useCallback((next: AppState) => dispatch({ type: 'replace', state: next }), [])

  const resetDemoData = useCallback(() => {
    const fresh = createSeedState({
      name: state.profile.name || 'Alex',
      primaryGoal: state.profile.primaryGoal,
      workStart: state.profile.workStart,
      workEnd: state.profile.workEnd,
      energyPattern: state.profile.energyPattern,
      habitKeys: [],
    })
    dispatch({
      type: 'replace',
      // Las asignaturas se teclean a mano y el demo no las incluye: se conservan.
      state: {
        ...fresh,
        onboardingComplete: true,
        settings: state.settings,
        profile: state.profile,
        subjects: state.subjects,
        timetable: state.timetable,
      },
    })
  }, [state.profile, state.settings, state.subjects, state.timetable])

  const hardReset = useCallback(() => {
    clearState()
    dispatch({ type: 'replace', state: { ...createEmptyState(), onboardingComplete: false } })
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({ state, dispatch, replaceState, resetDemoData, hardReset, today }),
    [state, replaceState, resetDemoData, hardReset, today],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/* ------------------------------- factories -------------------------------- */

export function newTask(partial: Partial<Task> & { title: string }): Task {
  return {
    id: uid('task'),
    title: partial.title,
    notes: partial.notes ?? '',
    status: partial.status ?? 'today',
    priority: partial.priority ?? 'medium',
    category: partial.category ?? 'work',
    dueDate: partial.dueDate ?? null,
    dueTime: partial.dueTime ?? null,
    estimateMin: partial.estimateMin ?? null,
    goalId: partial.goalId ?? null,
    subjectId: partial.subjectId ?? null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    order: partial.order ?? 0,
  }
}
