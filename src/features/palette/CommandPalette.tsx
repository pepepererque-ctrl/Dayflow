import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  CornerDownLeft,
  Flag,
  GraduationCap,
  Plus,
  Repeat,
  Search,
  Settings as SettingsIcon,
  Sun,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { PRIORITIES, STATUSES, colorVar } from '@/lib/constants'
import { diffDays, dayOfWeek, formatClock, formatDuration, formatShortDate, weekdayShort } from '@/lib/date'
import { PALETTE_EVENT, paletteShortcut } from '@/lib/palette'
import { fold, parseQuickAdd, type ParsedTask } from '@/lib/quickAdd'
import { navigate, type RouteName } from '@/lib/router'
import { isOpenSubject } from '@/lib/subjects'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { TranslationKey } from '@/i18n/es'
import type { Task } from '@/types'
import { SubjectChip } from '../subjects/SubjectBits'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'
import { taskFromParsed } from '../tasks/taskUtils'

type Group = 'create' | 'actions' | 'nav' | 'subjects' | 'tasks'

interface Item {
  id: string
  group: Group
  label: string
  detail?: ReactNode
  icon: ReactNode
  /** Palabras extra por las que se puede encontrar (sinónimos). */
  keywords: string
  run: () => void
}

const NAV: Array<{ name: RouteName; labelKey: TranslationKey; icon: LucideIcon; keywords: string }> = [
  { name: 'today', labelKey: 'nav.today', icon: Sun, keywords: 'inicio hoy dia' },
  { name: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare, keywords: 'pendientes tareas lista tablero' },
  { name: 'subjects', labelKey: 'nav.subjects', icon: GraduationCap, keywords: 'materias notas evaluacion' },
  { name: 'habits', labelKey: 'nav.habits', icon: Repeat, keywords: 'rutinas habitos racha' },
  { name: 'goals', labelKey: 'nav.goals', icon: Flag, keywords: 'objetivos metas' },
  { name: 'planner', labelKey: 'nav.planner', icon: CalendarRange, keywords: 'calendario agenda semana bloques' },
  { name: 'timetable', labelKey: 'nav.timetable', icon: CalendarDays, keywords: 'clases horario semanal' },
  { name: 'exams', labelKey: 'nav.exams', icon: ClipboardCheck, keywords: 'examenes parciales finales plan estudio' },
  { name: 'focus', labelKey: 'nav.focus', icon: Timer, keywords: 'pomodoro concentracion estudiar temporizador' },
  { name: 'analytics', labelKey: 'nav.analytics', icon: BarChart3, keywords: 'estadisticas analisis graficas' },
  { name: 'settings', labelKey: 'nav.settings', icon: SettingsIcon, keywords: 'ajustes configuracion tema exportar datos cuenta' },
]

/** Resultados máximos por grupo, para que la lista no se alargue sin fin. */
const PER_GROUP = 8

/**
 * Todas las palabras de la búsqueda deben empezar una palabra del elemento
 * («tar» encuentra «tareas», no «exportar»); cuanto antes aparezcan, mejor.
 */
function score(item: Item, words: string[]): number | null {
  const hay = fold(`${item.label} ${item.keywords}`)
  let total = 0
  for (const w of words) {
    let at = hay.indexOf(w)
    while (at > 0 && hay[at - 1] !== ' ') at = hay.indexOf(w, at + 1)
    if (at === -1) return null
    total += at
  }
  return total
}

/** Lo que se ha entendido de la frase, en pequeño, para que se vea antes de crear. */
function ParsedChips({ parsed, today }: { parsed: ParsedTask; today: string }) {
  const { state } = useApp()
  const t = useT()
  const subject = parsed.subjectId ? state.subjects.find((s) => s.id === parsed.subjectId) : null

  let when: string | null = null
  if (parsed.dueDate) {
    const delta = diffDays(parsed.dueDate, today)
    when =
      delta === 0
        ? t('date.today')
        : delta === 1
          ? t('date.tomorrow')
          : `${weekdayShort(dayOfWeek(parsed.dueDate))} ${formatShortDate(parsed.dueDate)}`
  }

  const chip = 'inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-ink-2'
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {subject ? <SubjectChip subject={subject} /> : null}
      {when ? (
        <span className={chip}>
          <CalendarDays size={11} />
          {when}
        </span>
      ) : null}
      {parsed.dueTime ? (
        <span className={chip}>
          <Clock3 size={11} />
          {formatClock(parsed.dueTime)}
        </span>
      ) : null}
      {parsed.priority ? (
        <span className={chip} style={{ color: colorVar(PRIORITIES[parsed.priority].color) }}>
          <Flag size={11} />
          {t(PRIORITIES[parsed.priority].labelKey)}
        </span>
      ) : null}
      {parsed.estimateMin ? (
        <span className={chip}>
          <Timer size={11} />
          {formatDuration(parsed.estimateMin)}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Paleta de comandos (Ctrl/⌘ + K): busca, navega y crea tareas escribiendo en
 * lenguaje natural. Vive una sola vez en la aplicación y se abre desde
 * cualquier sitio con el atajo o con `openPalette()`.
 */
export function CommandPalette() {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const t = useT()
  const uid = useId()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  /* ------------------------- apertura y atajo global ------------------------- */

  useEffect(() => {
    const show = () => {
      // Con otro diálogo abierto (un editor, o la decisión de sincronizar) no se
      // abre encima: lo que haya debajo no debe quedar a medias por un atajo.
      if (document.querySelector('[role="dialog"]:not([data-palette])')) return
      restoreTo.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close()
        else show()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(PALETTE_EVENT, show)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(PALETTE_EVENT, show)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      restoreTo.current?.focus?.()
    }
  }, [open])

  /* --------------------------------- elementos --------------------------------- */

  const parsed = useMemo(
    () => parseQuickAdd(query, { today, subjects: state.subjects }),
    [query, today, state.subjects],
  )

  const createTask = useCallback(() => {
    if (!parsed.title) return
    const task = taskFromParsed(parsed, 'backlog', today)
    dispatch({ type: 'addTask', task })
    toast(t('palette.created', { title: task.title }), {
      actionLabel: t('common.undoDelete'),
      onAction: () => dispatch({ type: 'deleteTask', id: task.id }),
    })
    close()
  }, [parsed, today, dispatch, toast, t, close])

  const { flat, grouped } = useMemo(() => {
    const q = query.trim()
    const words = fold(q).split(/\s+/).filter(Boolean)
    const go = (fn: () => void) => () => {
      close()
      fn()
    }
    const openSubjects = state.subjects.filter(isOpenSubject)

    const nav: Item[] = NAV.map((n) => {
      const Icon = n.icon
      return {
        id: `nav-${n.name}`,
        group: 'nav',
        label: t('palette.goTo', { name: t(n.labelKey) }),
        icon: <Icon size={16} />,
        keywords: `${t(n.labelKey)} ${n.keywords}`,
        run: go(() => navigate(n.name)),
      }
    })

    const actions: Item[] = [
      {
        id: 'act-new-task',
        group: 'actions',
        label: t('palette.newTask'),
        icon: <Plus size={16} />,
        keywords: 'crear anadir tarea nueva',
        run: go(() => {
          setEditingTask(null)
          setEditorOpen(true)
        }),
      },
      {
        id: 'act-focus',
        group: 'actions',
        label: t('palette.startFocus'),
        icon: <Timer size={16} />,
        keywords: 'pomodoro concentracion temporizador estudiar',
        run: go(() => navigate('focus')),
      },
    ]

    const subjects: Item[] = openSubjects.flatMap((s) => [
      {
        id: `sub-${s.id}`,
        group: 'subjects' as const,
        label: t('palette.openSubject', { name: s.name }),
        icon: <GraduationCap size={16} />,
        detail: <SubjectChip subject={s} className="mt-1" />,
        keywords: `${s.code} ${s.name} materia asignatura`,
        run: go(() => navigate(`subjects/${s.id}`)),
      },
      {
        id: `study-${s.id}`,
        group: 'subjects' as const,
        label: t('palette.studySubject', { name: s.name }),
        icon: <Timer size={16} />,
        keywords: `${s.code} ${s.name} estudiar pomodoro enfoque`,
        run: go(() => navigate(`focus?subject=${s.id}`)),
      },
    ])

    const tasks: Item[] = state.tasks
      .filter((task) => task.status !== 'done')
      .map((task) => ({
        id: `task-${task.id}`,
        group: 'tasks' as const,
        label: task.title,
        icon: <CheckSquare size={16} />,
        detail: (
          <span className="mt-0.5 block text-2xs text-ink-3">
            {t(STATUSES[task.status].labelKey)}
            {task.dueDate ? ` · ${formatShortDate(task.dueDate)}` : ''}
          </span>
        ),
        keywords: '',
        run: go(() => setDetailTask(task)),
      }))

    // Sin búsqueda: los atajos de siempre. Con búsqueda: lo que coincide.
    let pool: Item[]
    if (!words.length) {
      pool = [...actions, ...nav, ...subjects.filter((i) => i.id.startsWith('sub-'))]
    } else {
      // Con búsqueda manda la relevancia, no el tipo: «tar» debe llevar antes a
      // «Ir a Tareas» que a «Nueva tarea…». A igual puntuación, gana el orden de abajo.
      const rank = (items: Item[], priority: number) =>
        items
          .map((item) => ({ item, s: score(item, words), priority }))
          .filter((x): x is { item: Item; s: number; priority: number } => x.s !== null)
          .sort((a, b) => a.s - b.s)
          .slice(0, PER_GROUP)
      pool = [rank(nav, 0), rank(actions, 1), rank(subjects, 2), rank(tasks, 3)]
        .flat()
        .sort((a, b) => a.s - b.s || a.priority - b.priority)
        .map((x) => x.item)
    }

    // «Crear tarea»: primero si la frase parece una tarea (fecha, hora, prioridad…
    // o tres palabras o más), y si no, detrás de lo que coincida, para que
    // escribir «tar» + Enter siga llevando a Tareas.
    const create: Item[] = parsed.title
      ? [
          {
            id: 'create-task',
            group: 'create',
            label: t('palette.create', { title: parsed.title }),
            icon: <Plus size={16} />,
            detail: parsed.recognized ? <ParsedChips parsed={parsed} today={today} /> : undefined,
            keywords: '',
            run: createTask,
          },
        ]
      : []
    const looksLikeTask = parsed.recognized > 0 || words.length >= 3
    const flat = looksLikeTask || !pool.length ? [...create, ...pool] : [...pool, ...create]

    // Los encabezados siguen el orden de la lista: un nuevo bloque cada vez que cambia el tipo.
    const grouped: Array<{ group: Group; items: Item[] }> = []
    for (const item of flat) {
      const last = grouped[grouped.length - 1]
      if (last && last.group === item.group) last.items.push(item)
      else grouped.push({ group: item.group, items: [item] })
    }
    return { flat, grouped }
  }, [query, state.subjects, state.tasks, parsed, today, t, close, createTask])

  // La selección vuelve arriba al cambiar la búsqueda.
  useEffect(() => setActive(0), [query])

  const activeId = flat[active] ? `${uid}-opt-${flat[active].id}` : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Ctrl/⌘ + Intro crea la tarea siempre, aunque la frase también encaje con un comando.
      if (e.ctrlKey || e.metaKey) createTask()
      else flat[active]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  const groupLabel: Record<Group, string> = {
    create: t('palette.groupCreate'),
    actions: t('palette.groupActions'),
    nav: t('palette.groupNav'),
    subjects: t('palette.groupSubjects'),
    tasks: t('palette.groupTasks'),
  }

  return (
    <>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[9vh] sm:pt-[14vh]">
              <div
                className="absolute inset-0 animate-[fade_0.15s_ease-out_both] bg-[rgb(20_16_14/0.45)] backdrop-blur-[2px]"
                onClick={close}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-modal="true"
                data-palette
                aria-label={t('palette.label')}
                className="relative flex max-h-[78dvh] w-full max-w-xl animate-[pop_0.18s_cubic-bezier(0.22,1,0.36,1)_both] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-modal"
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Search size={17} className="shrink-0 text-ink-3" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={`${uid}-list`}
                    aria-activedescendant={activeId}
                    aria-autocomplete="list"
                    aria-label={t('palette.label')}
                    placeholder={t('palette.placeholder')}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-14 min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-ink-3"
                  />
                </div>

                <div id={`${uid}-list`} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
                  {flat.length === 0 ? (
                    <div className="px-3 py-8 text-center">
                      <p className="text-sm font-medium text-ink">{t('palette.empty')}</p>
                      <p className="mt-1 text-xs text-ink-3">{t('palette.emptyHint')}</p>
                    </div>
                  ) : (
                    grouped.map(({ group, items }, gi) => (
                      <div key={`${group}-${gi}`} role="group" aria-label={groupLabel[group]} className="mb-1">
                        <p className="eyebrow px-3 pb-1 pt-2">{groupLabel[group]}</p>
                        {items.map((item) => {
                          const index = flat.indexOf(item)
                          const isActive = index === active
                          return (
                            <div
                              key={item.id}
                              id={`${uid}-opt-${item.id}`}
                              role="option"
                              aria-selected={isActive}
                              // mousedown y no click: así el campo no pierde el foco al pulsar.
                              onMouseDown={(e) => {
                                e.preventDefault()
                                item.run()
                              }}
                              onMouseMove={() => setActive(index)}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                                isActive ? 'bg-brand-soft text-ink' : 'text-ink-2',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                  isActive ? 'bg-surface text-brand-ink' : 'bg-surface-2 text-ink-3',
                                )}
                              >
                                {item.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                                {item.detail}
                              </span>
                              {isActive ? <CornerDownLeft size={14} className="shrink-0 text-ink-3" /> : null}
                            </div>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>

                <p className="sr-only" aria-live="polite">
                  {t('palette.results', { n: flat.length })}
                </p>

                <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-2/60 px-4 py-2.5 text-2xs text-ink-3 sm:flex">
                  <span>{t('palette.example')}</span>
                  <span className="flex items-center gap-3">
                    <span>
                      <kbd className="font-sans font-semibold">↑↓</kbd> {t('palette.hintMove')}
                    </span>
                    <span>
                      <kbd className="font-sans font-semibold">↵</kbd> {t('palette.hintSelect')}
                    </span>
                    <span>
                      <kbd className="font-sans font-semibold">{paletteShortcut().startsWith('⌘') ? '⌘↵' : 'Ctrl ↵'}</kbd>{' '}
                      {t('palette.hintCreate')}
                    </span>
                    <span>
                      <kbd className="font-sans font-semibold">Esc</kbd> {t('palette.hintClose')}
                    </span>
                  </span>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <TaskDetail
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onEdit={(task) => {
          setDetailTask(null)
          setEditingTask(task)
          setEditorOpen(true)
        }}
      />
      <TaskEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingTask(null)
        }}
        task={editingTask}
        defaultStatus="today"
      />
    </>
  )
}
