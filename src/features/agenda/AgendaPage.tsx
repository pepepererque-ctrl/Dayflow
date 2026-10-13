import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Columns3, LayoutGrid, Menu, Plus, Rows3, Search } from 'lucide-react'
import { Switch } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import {
  DEFAULT_SHOW,
  buildAgenda,
  filterAgenda,
  monthWeeks,
  parseShow,
  shiftMonth,
  type AgendaItem,
  type AgendaShow,
} from '@/lib/agenda'
import { addDays, clockFromMinutes, formatShortDate, minutesFromClock, monthName } from '@/lib/date'
import { openPalette } from '@/lib/palette'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ISODate, Task, TimeBlock } from '@/types'
import { BlockEditor } from '../planner/BlockEditor'
import { TimeGridView } from '../planner/PlannerPage'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'
import { DayPanel } from './DayPanel'
import { MonthPicker } from './MonthPicker'
import { MonthView } from './MonthView'

type View = 'month' | 'week' | 'day'

const VIEW_KEY = 'dayflow.agenda.view'
const SHOW_KEY = 'dayflow.agenda.show'

const SHOW_OPTIONS: Array<{
  key: keyof AgendaShow
  labelKey: 'agenda.showClasses' | 'agenda.showExams' | 'agenda.showTasks' | 'agenda.showBlocks'
}> = [
  { key: 'classes', labelKey: 'agenda.showClasses' },
  { key: 'exams', labelKey: 'agenda.showExams' },
  { key: 'tasks', labelKey: 'agenda.showTasks' },
  { key: 'blocks', labelKey: 'agenda.showBlocks' },
]
const VIEWS: Array<{ value: View; labelKey: 'agenda.viewMonth' | 'agenda.viewWeek' | 'agenda.viewDay'; icon: typeof Menu }> = [
  { value: 'month', labelKey: 'agenda.viewMonth', icon: LayoutGrid },
  { value: 'week', labelKey: 'agenda.viewWeek', icon: Columns3 },
  { value: 'day', labelKey: 'agenda.viewDay', icon: Rows3 },
]

/** La vista con la que se dejó la agenda, para volver a ella la próxima vez. */
function loadView(): View {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored === 'month' || stored === 'week' || stored === 'day') return stored
  } catch {
    /* sin almacenamiento se empieza por el mes */
  }
  return 'month'
}

/** Qué tipos de cosas se mostraban la última vez. */
function loadShow(): AgendaShow {
  try {
    return parseShow(JSON.parse(localStorage.getItem(SHOW_KEY) ?? 'null'))
  } catch {
    return DEFAULT_SHOW
  }
}

/**
 * La agenda al estilo del calendario del móvil: el mes como cuadrícula de
 * colores con el detalle del día debajo, y las vistas de semana y día con la
 * rejilla de horas. Un botón flotante añade algo al día elegido.
 */
export function AgendaPage() {
  const { state, today } = useApp()
  const t = useT()

  const [view, setView] = useState<View>(loadView)
  const [show, setShow] = useState<AgendaShow>(loadShow)
  const [anchor, setAnchor] = useState<ISODate>(today)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)
  const [blockEditorOpen, setBlockEditorOpen] = useState(false)
  const [blockDefaults, setBlockDefaults] = useState<{ date: string; start: string; end: string } | undefined>()
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)

  const weekStartsOn = state.settings.weekStartsOn
  const month = anchor.slice(0, 7)

  // Se recalcula al cambiar de mes o de datos, no al elegir otro día del mismo mes.
  const weeks = useMemo(() => monthWeeks(`${month}-01`, weekStartsOn), [month, weekStartsOn])
  const fullAgenda = useMemo(
    () => buildAgenda(state, weeks.flat(), today),
    [state.subjects, state.timetable, state.blocks, state.tasks, weeks, today],
  )
  const agenda = useMemo(() => filterAgenda(fullAgenda, show), [fullAgenda, show])

  const changeView = (next: View) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* no pasa nada: solo se pierde recordar la vista */
    }
  }

  const toggleShow = (key: keyof AgendaShow, value: boolean) => {
    const next = { ...show, [key]: value }
    setShow(next)
    try {
      localStorage.setItem(SHOW_KEY, JSON.stringify(next))
    } catch {
      /* no pasa nada: solo se pierde recordar lo que se muestra */
    }
  }

  const goMonth = useCallback((delta: 1 | -1) => {
    setDirection(delta)
    setAnchor((a) => shiftMonth(a, delta))
  }, [])

  /** Un mes, una semana o un día hacia delante o atrás, según la vista. */
  const goPeriod = useCallback(
    (delta: 1 | -1) => {
      if (view === 'month') return goMonth(delta)
      setDirection(delta)
      setAnchor((a) => addDays(a, delta * (view === 'week' ? 7 : 1)))
    },
    [view, goMonth],
  )

  const goToday = () => {
    setDirection(today >= anchor ? 1 : -1)
    setAnchor(today)
  }

  const pickMonth = (year: number, monthIndex: number) => {
    const current = Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1
    const delta = year * 12 + monthIndex - current
    if (delta !== 0) {
      setDirection(delta > 0 ? 1 : -1)
      setAnchor((a) => shiftMonth(a, delta))
    }
    setPickerOpen(false)
  }

  const openAdd = () => {
    const now = new Date()
    // Hoy: la próxima hora en punto. Otro día: cuando empieza tu jornada.
    const start =
      anchor === today
        ? Math.min(22 * 60, (now.getHours() + 1) * 60)
        : Math.max(6 * 60, minutesFromClock(state.profile.workStart))
    setBlockDefaults({
      date: anchor,
      start: clockFromMinutes(start),
      end: clockFromMinutes(Math.min(start + 60, 23 * 60 + 59)),
    })
    setEditingBlock(null)
    setBlockEditorOpen(true)
  }

  const openItem = (item: AgendaItem) => {
    if (item.kind === 'block') {
      const block = state.blocks.find((b) => b.id === item.refId)
      if (!block) return
      setEditingBlock(block)
      setBlockDefaults(undefined)
      setBlockEditorOpen(true)
    } else if (item.kind === 'task') {
      const task = state.tasks.find((x) => x.id === item.refId)
      if (task) setDetailTask(task)
    } else if (item.kind === 'exam') {
      navigate('exams')
    } else {
      navigate('timetable')
    }
  }

  const year = Number(anchor.slice(0, 4))
  const title = `${monthName(anchor)}${year !== Number(today.slice(0, 4)) ? ` ${year}` : ''}`

  const iconButton =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-surface-2'

  return (
    <>
      {/* ------------------------------- cabecera ------------------------------ */}
      <header className="mb-4 flex items-center gap-1.5">
        <button type="button" className={iconButton} onClick={() => setMenuOpen(true)} aria-label={t('agenda.menu')}>
          <Menu size={22} />
        </button>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={`${t('agenda.pickMonth')}: ${title}`}
          className="min-w-0 truncate rounded-xl px-1.5 py-1 text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink transition-colors hover:bg-surface-2"
        >
          {title}
        </button>

        {/* En pantallas con ratón no se desliza: flechas para cambiar de periodo. */}
        <span className="hidden items-center md:flex">
          <button type="button" className={iconButton} onClick={() => goPeriod(-1)} aria-label={t('agenda.prevPeriod')}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" className={iconButton} onClick={() => goPeriod(1)} aria-label={t('agenda.nextPeriod')}>
            <ChevronRight size={20} />
          </button>
        </span>

        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={iconButton} onClick={openPalette} aria-label={t('agenda.search')}>
            <Search size={21} />
          </button>
          <button
            type="button"
            onClick={goToday}
            aria-label={t('agenda.goToday')}
            className="tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            {Number(today.slice(8, 10))}
          </button>
        </span>
      </header>

      {/* -------------------------------- cuerpo ------------------------------- */}
      {view === 'month' ? (
        <>
          <MonthView
            weeks={weeks}
            month={month}
            selected={anchor}
            today={today}
            weekStartsOn={weekStartsOn}
            agenda={agenda}
            direction={direction}
            onSelect={setAnchor}
            onSwipe={goMonth}
          />
          <DayPanel date={anchor} items={agenda.get(anchor) ?? []} onOpen={openItem} onAdd={openAdd} />
        </>
      ) : (
        <TimeGridView
          anchor={anchor}
          mode={view}
          direction={direction}
          show={show}
          onAnchor={setAnchor}
          onOpenDay={(date) => {
            setAnchor(date)
            changeView('day')
          }}
          onSwipe={goPeriod}
        />
      )}

      {/* Hueco para que el botón flotante no tape el final de la página. */}
      <div className="h-28" aria-hidden="true" />

      {/* --------------------------- botón de añadir --------------------------- */}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4',
          'bottom-[calc(78px+env(safe-area-inset-bottom,0px))] md:bottom-7 md:left-[236px] xl:left-[252px]',
        )}
      >
        <button
          type="button"
          onClick={openAdd}
          className="pointer-events-auto flex h-14 w-full max-w-[19rem] items-center justify-between rounded-full border border-line-strong bg-surface-2 px-6 text-md font-medium text-ink shadow-modal transition-transform active:scale-[0.98]"
        >
          <span>{t('agenda.addOn', { date: formatShortDate(anchor) })}</span>
          <Plus size={22} />
        </button>
      </div>

      {/* -------------------------------- hojas -------------------------------- */}
      <MonthPicker open={pickerOpen} onClose={() => setPickerOpen(false)} current={anchor} onPick={pickMonth} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} label={t('agenda.viewTitle')}>
        <p className="eyebrow mb-2 px-1">{t('agenda.viewTitle')}</p>
        <ul className="space-y-1">
          {VIEWS.map(({ value, labelKey, icon: Icon }) => (
            <li key={value}>
              <button
                type="button"
                aria-pressed={view === value}
                onClick={() => {
                  changeView(value)
                  setMenuOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-md font-medium transition-colors',
                  view === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                <Icon size={20} />
                <span className="flex-1">{t(labelKey)}</span>
                {view === value ? <Check size={18} /> : null}
              </button>
            </li>
          ))}
        </ul>

        <p className="eyebrow mb-1 mt-5 px-1">{t('agenda.show')}</p>
        <ul>
          {SHOW_OPTIONS.map(({ key, labelKey }) => (
            <li key={key} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
              <span className="text-md font-medium text-ink-2">{t(labelKey)}</span>
              <Switch checked={show[key]} onChange={(value) => toggleShow(key, value)} label={t(labelKey)} />
            </li>
          ))}
        </ul>
      </Sheet>

      <BlockEditor
        open={blockEditorOpen}
        onClose={() => {
          setBlockEditorOpen(false)
          setEditingBlock(null)
        }}
        block={editingBlock}
        defaults={blockDefaults}
      />
      <TaskDetail
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onEdit={(task) => {
          setDetailTask(null)
          setEditingTask(task)
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
      />
    </>
  )
}
