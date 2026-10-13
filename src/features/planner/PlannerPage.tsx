import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckSquare, ClipboardCheck } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { BLOCK_CATEGORIES, CATEGORIES, CLASS_KINDS, colorVar } from '@/lib/constants'
import type { AgendaShow } from '@/lib/agenda'
import {
  clockFromMinutes,
  dayOfWeek,
  formatClock,
  formatShortDate,
  minutesFromClock,
  nowClock,
  weekDates,
  weekdayLong,
  weekdayShort,
} from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { listExams } from '@/lib/exams'
import { navigate } from '@/lib/router'
import { subjectShort } from '@/lib/subjects'
import { classesOn, layoutLanes } from '@/lib/timetable'
import { useApp } from '@/store/AppStore'
import type { ISODate, Task, TimeBlock } from '@/types'
import { BlockEditor } from './BlockEditor'
import { TaskDetail } from '../tasks/TaskDetail'
import { TaskEditor } from '../tasks/TaskEditor'

const HOUR_H = 56
/** Ancho de la columna de horas. Lo justo para «23» y para la hora de ahora, «19:17». */
const GUTTER = 38
/** Un examen no tiene duración guardada: se dibuja una hora desde que empieza. */
const EXAM_BLOCK_MIN = 60
const SNAP = 15
const DAY_MINUTES = 24 * 60
/** Lo que hay que arrastrar en horizontal para contar como «cambiar de semana o de día». */
const SWIPE_MIN = 56
/** Minutos de cercanía con la hora de ahora a partir de los que se oculta el número de hora para no pisarlo. */
const NOW_CLEARANCE = 14

/**
 * La rejilla tiene alto fijo, así que el rango debe cubrir también las tareas
 * con hora: una tarea a las 21:30 caía fuera y quedaba invisible y sin poder pulsarse.
 */
function clampRange(
  blocks: TimeBlock[],
  tasks: Task[],
  workStart: string,
  workEnd: string,
  extra: Array<{ start: number; end: number }> = [],
) {
  let min = Math.min(minutesFromClock(workStart), 8 * 60)
  let max = Math.max(minutesFromClock(workEnd), 19 * 60)
  for (const b of blocks) {
    min = Math.min(min, minutesFromClock(b.start))
    max = Math.max(max, minutesFromClock(b.end))
  }
  for (const c of extra) {
    min = Math.min(min, c.start)
    max = Math.max(max, c.end)
  }
  for (const task of tasks) {
    const at = minutesFromClock(task.dueTime as string)
    min = Math.min(min, at)
    // La tarjeta de la tarea mide 34px, algo más de media hora de rejilla.
    max = Math.max(max, at + 45)
  }
  // Redondear a horas enteras con un poco de aire.
  return { startHour: Math.max(0, Math.floor(min / 60) - 1), endHour: Math.min(24, Math.ceil(max / 60) + 1) }
}

/**
 * Las vistas de semana y de día: la rejilla de horas. La cabecera, el cambio de
 * vista y el botón de añadir los pone la página de la agenda.
 */
export function TimeGridView({
  anchor,
  mode,
  direction,
  show,
  onAnchor: setAnchor,
  onOpenDay,
  onSwipe,
}: {
  anchor: ISODate
  mode: 'week' | 'day'
  /** Hacia dónde se ha movido por última vez, para animar la entrada. */
  direction: 1 | -1
  show: AgendaShow
  onAnchor: (date: ISODate) => void
  /** Volver a pulsar el día ya elegido abre la vista de ese día. */
  onOpenDay: (date: ISODate) => void
  /** +1 = siguiente semana o día, -1 = anterior. */
  onSwipe: (delta: 1 | -1) => void
}) {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const t = useT()

  const [editing, setEditing] = useState<TimeBlock | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [defaults, setDefaults] = useState<{ date: string; start: string; end: string } | undefined>()
  const [drag, setDrag] = useState<{ id: string; grabOffsetMin: number } | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const weekStartsOn = state.settings.weekStartsOn
  const days = useMemo(
    () => (mode === 'week' ? weekDates(anchor, weekStartsOn) : [anchor]),
    [anchor, mode, weekStartsOn],
  )
  const daySet = useMemo(() => new Set(days), [days])

  const visibleBlocks = useMemo(
    () => (show.blocks ? state.blocks.filter((b) => daySet.has(b.date)) : []),
    [state.blocks, daySet, show.blocks],
  )

  const timedTasks = useMemo(
    () => (show.tasks ? state.tasks.filter((t) => t.dueTime && t.dueDate && daySet.has(t.dueDate)) : []),
    [state.tasks, daySet, show.tasks],
  )

  // Las entregas sin hora no tienen sitio en la rejilla: van arriba, con lo de todo el día.
  const allDayTasks = useMemo(
    () =>
      show.tasks
        ? state.tasks.filter((t) => !t.dueTime && t.dueDate && daySet.has(t.dueDate) && t.status !== 'done')
        : [],
    [state.tasks, daySet, show.tasks],
  )

  // Las clases del horario se repiten solas: se calculan para los días visibles.
  const visibleClasses = useMemo(
    () => (show.classes ? days.flatMap((d) => classesOn(state, d)) : []),
    [days, state.subjects, state.timetable, show.classes],
  )

  // Exámenes de los días visibles, pasados incluidos (con su nota, si ya la hay).
  const weekExams = useMemo(() => {
    if (!show.exams) return []
    const { upcoming, past } = listExams(state.subjects, today)
    return [...past, ...upcoming].filter((e) => daySet.has(e.date))
  }, [state.subjects, today, daySet, show.exams])

  const { startHour, endHour } = clampRange(
    visibleBlocks,
    timedTasks,
    state.profile.workStart,
    state.profile.workEnd,
    [
      ...visibleClasses,
      ...weekExams
        .filter((e) => e.item.time)
        .map((e) => ({
          start: minutesFromClock(e.item.time as string),
          end: minutesFromClock(e.item.time as string) + EXAM_BLOCK_MIN,
        })),
    ],
  )
  const rangeStart = startHour * 60
  const totalMinutes = (endHour - startHour) * 60
  const gridHeight = (totalMinutes / 60) * HOUR_H

  const openNew = (date: ISODate, startMin: number) => {
    const snapped = Math.round(startMin / SNAP) * SNAP
    setEditing(null)
    setDefaults({
      date,
      start: clockFromMinutes(snapped),
      end: clockFromMinutes(Math.min(snapped + 60, DAY_MINUTES - 1)),
    })
    setEditorOpen(true)
  }

  const openExisting = (block: TimeBlock) => {
    setEditing(block)
    setDefaults(undefined)
    setEditorOpen(true)
  }

  /** Converts a pointer Y within a day column into snapped minutes. */
  const minutesFromPointer = (clientY: number, columnTop: number) => {
    const offset = clientY - columnTop
    const minutes = rangeStart + (offset / HOUR_H) * 60
    return Math.max(0, Math.min(DAY_MINUTES - SNAP, Math.round(minutes / SNAP) * SNAP))
  }

  const nowMinutes = minutesFromClock(nowClock())

  // Como el calendario del móvil, que se abre en la hora actual y no en la madrugada.
  // Solo al abrir la vista: no debe moverse sola cuando se cambia de semana o de día.
  useEffect(() => {
    // Un instante después: el reinicio de scroll de la página (que sube arriba al
    // entrar) se ejecuta tras este efecto y, si no, lo desharía.
    const id = window.setTimeout(() => {
      const main = document.getElementById('dayflow-main')
      const grid = gridRef.current
      if (!main || !grid || !daySet.has(today)) return
      const nowOffset = ((nowMinutes - rangeStart) / 60) * HOUR_H
      if (nowOffset < 0) return
      const gridTop = grid.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
      main.scrollTo({ top: Math.max(0, gridTop + nowOffset - main.clientHeight * 0.35) })
    }, 80)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const showNowLine = nowMinutes >= rangeStart && nowMinutes <= endHour * 60
  const showNowLabel = showNowLine && daySet.has(today)
  const cols = { gridTemplateColumns: `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))` }
  const narrow = mode === 'week'

  return (
    <>
      <div
        // Deslizar en horizontal cambia de semana o de día; en vertical sigue desplazando la página.
        className="touch-pan-y select-none"
        onTouchStart={(e) => {
          const p = e.touches[0]
          touch.current = { x: p.clientX, y: p.clientY }
        }}
        onTouchEnd={(e) => {
          const start = touch.current
          touch.current = null
          if (!start) return
          const p = e.changedTouches[0]
          const dx = p.clientX - start.x
          const dy = p.clientY - start.y
          if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
        }}
      >
        <div
          key={days[0]}
          className={direction === 1 ? 'animate-[agenda-in-next_0.22s_ease-out]' : 'animate-[agenda-in-prev_0.22s_ease-out]'}
        >
          {/* --------------------------- cabecera de días -------------------------- */}
          {mode === 'week' ? (
            <>
              <div className="grid" style={cols} aria-hidden="true">
                <div />
                {days.map((date) => (
                  <span
                    key={date}
                    className={cn('eyebrow py-1.5 text-center !tracking-[0.04em]', dayOfWeek(date) === 0 && '!text-bad')}
                  >
                    {weekdayShort(dayOfWeek(date))}
                  </span>
                ))}
              </div>
              <div className="mb-2 grid" style={cols}>
                <div />
                {days.map((date) => {
                  const isToday = date === today
                  const selected = date === anchor
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => (selected ? onOpenDay(date) : setAnchor(date))}
                      aria-pressed={selected}
                      aria-label={formatShortDate(date)}
                      className={cn(
                        'mx-0.5 flex items-center justify-center rounded-xl bg-surface-2 py-2 transition-[box-shadow] duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]',
                        selected && 'ring-1 ring-ink-3',
                      )}
                    >
                      <span
                        className={cn(
                          'tnum flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-base font-semibold',
                          isToday ? 'bg-ink text-surface' : dayOfWeek(date) === 0 ? 'text-bad' : 'text-ink',
                        )}
                      >
                        {Number(date.slice(8, 10))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mb-3 flex items-center gap-3 px-1">
              <span
                className={cn(
                  'tnum flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-semibold',
                  anchor === today ? 'bg-ink text-surface' : 'bg-surface-3 text-ink',
                )}
              >
                {Number(anchor.slice(8, 10))}
              </span>
              <span className={cn('text-xl font-semibold', dayOfWeek(anchor) === 0 ? 'text-bad' : 'text-ink')}>
                {weekdayLong(dayOfWeek(anchor))}
              </span>
            </div>
          )}

          {/* ---------------------------- todo el día ----------------------------- */}
          {weekExams.length || allDayTasks.length ? (
            <div className="mb-2 grid" style={cols}>
              <div />
              {days.map((date) => (
                <div key={date} className="min-w-0 space-y-1 px-0.5">
                  {weekExams
                    .filter((e) => e.date === date)
                    .map((e) => {
                      const tint = colorVar(e.subject.color)
                      return (
                        <button
                          key={e.item.id}
                          type="button"
                          onClick={() => navigate('exams')}
                          title={`${e.subject.name} · ${e.item.name}${e.item.time ? ` · ${formatClock(e.item.time)}` : ''}`}
                          className="flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-1 text-left text-2xs font-semibold leading-tight"
                          style={{
                            color: tint,
                            background: `color-mix(in srgb, ${tint} 14%, transparent)`,
                            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 40%, transparent)`,
                          }}
                        >
                          <ClipboardCheck size={11} className="shrink-0" />
                          <span className="truncate">
                            {narrow ? subjectShort(e.subject) : `${subjectShort(e.subject)} · ${e.item.name}`}
                          </span>
                        </button>
                      )
                    })}
                  {allDayTasks
                    .filter((task) => task.dueDate === date)
                    .map((task) => {
                      const subject = task.subjectId ? state.subjects.find((s) => s.id === task.subjectId) : null
                      const tint = colorVar(subject?.color ?? CATEGORIES[task.category].color)
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setDetailTask(task)}
                          title={task.title}
                          className="flex w-full min-w-0 items-center gap-1 rounded-md border border-dashed px-1 py-1 text-left text-2xs font-semibold leading-tight"
                          style={{ color: tint, borderColor: `color-mix(in srgb, ${tint} 55%, transparent)` }}
                        >
                          <CheckSquare size={11} className="shrink-0" />
                          {/* En la semana la columna no da para el título: las siglas, o nada. */}
                          {narrow ? (
                            subject ? <span className="truncate">{subjectShort(subject)}</span> : null
                          ) : (
                            <span className="truncate">{task.title}</span>
                          )}
                        </button>
                      )
                    })}
                </div>
              ))}
            </div>
          ) : null}

          {/* ------------------------------ rejilla ------------------------------- */}
          <div ref={gridRef} className="relative grid" style={{ ...cols, height: gridHeight }}>
            {/* Columna de horas: solo el número, como en el calendario del móvil. */}
            <div className="relative" aria-hidden="true">
              {Array.from({ length: endHour - startHour }, (_, i) => {
                const minute = (startHour + i) * 60
                const hidden = showNowLabel && Math.abs(minute - nowMinutes) < NOW_CLEARANCE
                return i === 0 || hidden ? null : (
                  <div
                    key={i}
                    className="tnum absolute right-2 -translate-y-1/2 text-2xs text-ink-3"
                    style={{ top: i * HOUR_H }}
                  >
                    {startHour + i === 24 ? 0 : startHour + i}
                  </div>
                )
              })}
              {showNowLabel ? (
                <div
                  className="tnum absolute right-1 z-20 -translate-y-1/2 text-2xs font-semibold text-bad"
                  style={{ top: ((nowMinutes - rangeStart) / 60) * HOUR_H }}
                >
                  {nowClock()}
                </div>
              ) : null}
            </div>

            {days.map((date) => {
              const dayBlocks = visibleBlocks
                .filter((b) => b.date === date)
                .sort((a, b) => minutesFromClock(a.start) - minutesFromClock(b.start))
              const dayTasks = timedTasks.filter((t) => t.dueDate === date)
              const dayClasses = layoutLanes(visibleClasses.filter((c) => c.date === date))

              return (
                <div
                  key={date}
                  className="relative border-l border-line/70"
                  onDragOver={(e) => {
                    if (drag) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (!drag) return
                    const block = state.blocks.find((b) => b.id === drag.id)
                    if (!block) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const duration = minutesFromClock(block.end) - minutesFromClock(block.start)
                    const dropped = minutesFromPointer(e.clientY, rect.top) - drag.grabOffsetMin
                    // Keep the whole block inside the day rather than letting it wrap past midnight.
                    const maxStart = Math.max(0, DAY_MINUTES - 1 - duration)
                    const start = Math.max(0, Math.min(maxStart, Math.round(dropped / SNAP) * SNAP))
                    const end = Math.min(DAY_MINUTES - 1, start + duration)
                    dispatch({
                      type: 'patchBlock',
                      id: block.id,
                      patch: {
                        date,
                        start: clockFromMinutes(start),
                        end: clockFromMinutes(end),
                      },
                    })
                    setDrag(null)
                    toast(t('planner.moved'))
                  }}
                  onDoubleClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    openNew(date, minutesFromPointer(e.clientY, rect.top))
                  }}
                >
                  {/* Líneas de hora (continuas) y de media hora (punteadas); cada hora se puede pulsar para crear. */}
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openNew(date, (startHour + i) * 60)}
                      aria-label={t('planner.addAt', {
                        date: formatShortDate(date),
                        time: formatClock(clockFromMinutes((startHour + i) * 60)),
                      })}
                      className="absolute inset-x-0 border-t border-line transition-colors hover:bg-brand-soft/40"
                      style={{ top: i * HOUR_H, height: HOUR_H }}
                    />
                  ))}
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <span
                      key={`half-${i}`}
                      className="pointer-events-none absolute inset-x-0 border-t border-dotted border-line/80"
                      style={{ top: i * HOUR_H + HOUR_H / 2 }}
                      aria-hidden="true"
                    />
                  ))}

                  {/* La hora de ahora: triángulo y línea roja, solo en la columna de hoy. */}
                  {date === today && showNowLine ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                      style={{ top: ((nowMinutes - rangeStart) / 60) * HOUR_H }}
                    >
                      <span className="h-0 w-0 shrink-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-bad" />
                      <span className="h-px flex-1 bg-bad" />
                    </div>
                  ) : null}

                  {/* clases del horario: rayadas y sin interferir con lo que se crea encima */}
                  {dayClasses.map((c) => {
                    const tint = colorVar(c.subject.color)
                    const top = ((c.start - rangeStart) / 60) * HOUR_H
                    const height = Math.max(20, ((c.end - c.start) / 60) * HOUR_H - 2)
                    return (
                      <div
                        key={c.slot.id}
                        title={`${c.subject.name} · ${formatClock(c.slot.start)}-${formatClock(c.slot.end)}${c.slot.room ? ` · ${c.slot.room}` : ''}`}
                        className="pointer-events-none absolute z-[1] overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 sm:px-1.5"
                        style={{
                          top,
                          height,
                          left: `calc(${(c.lane / c.lanes) * 100}% + 2px)`,
                          width: `calc(${100 / c.lanes}% - 4px)`,
                          borderLeftColor: tint,
                          background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${tint} 15%, transparent) 0 6px, color-mix(in srgb, ${tint} 7%, transparent) 6px 12px)`,
                        }}
                      >
                        <p className="truncate text-2xs font-semibold leading-tight" style={{ color: tint }}>
                          {narrow ? subjectShort(c.subject) : `${subjectShort(c.subject)} · ${t(CLASS_KINDS[c.slot.kind].labelKey)}`}
                        </p>
                        {height >= 38 && c.slot.room ? (
                          <p className="truncate text-2xs leading-tight text-ink-3">{c.slot.room}</p>
                        ) : null}
                      </div>
                    )
                  })}

                  {/* exámenes con hora */}
                  {weekExams
                    .filter((e) => e.date === date && e.item.time)
                    .map((e) => {
                      const start = minutesFromClock(e.item.time as string)
                      return (
                        <button
                          key={e.item.id}
                          type="button"
                          onClick={() => navigate('exams')}
                          title={`${e.subject.name} · ${e.item.name} · ${formatClock(e.item.time as string)}`}
                          className="absolute inset-x-0.5 z-[5] overflow-hidden rounded-lg border-l-[3px] border-bad bg-bad/10 px-1 py-1 text-left sm:inset-x-1 sm:px-2"
                          style={{
                            top: ((start - rangeStart) / 60) * HOUR_H,
                            height: (EXAM_BLOCK_MIN / 60) * HOUR_H - 3,
                          }}
                        >
                          <p className="truncate text-2xs font-semibold leading-tight text-bad sm:text-xs">{e.item.name}</p>
                          <p className="tnum truncate text-2xs leading-tight text-ink-3">
                            {formatClock(e.item.time as string)}
                            {e.item.room && !narrow ? ` · ${e.item.room}` : ''}
                          </p>
                        </button>
                      )
                    })}

                  {/* blocks */}
                  {dayBlocks.map((block) => {
                    const start = minutesFromClock(block.start)
                    const end = minutesFromClock(block.end)
                    const top = ((start - rangeStart) / 60) * HOUR_H
                    const height = Math.max(22, ((end - start) / 60) * HOUR_H - 3)
                    const blockSubject = block.subjectId
                      ? state.subjects.find((s) => s.id === block.subjectId)
                      : null
                    // La asignatura manda sobre la categoría: así se ve de un vistazo qué materia es.
                    const tint = colorVar(blockSubject?.color ?? BLOCK_CATEGORIES[block.category].color)
                    const short = height < 44

                    return (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const grabOffsetMin = ((e.clientY - rect.top) / HOUR_H) * 60
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', block.id)
                          setDrag({ id: block.id, grabOffsetMin })
                        }}
                        onDragEnd={() => setDrag(null)}
                        onClick={() => openExisting(block)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openExisting(block)
                          }
                        }}
                        title={`${block.title} · ${formatClock(block.start)}-${formatClock(block.end)}`}
                        className={cn(
                          'absolute left-0.5 z-10 cursor-grab overflow-hidden rounded-lg border-l-[3px] px-1 py-1 text-left transition-shadow hover:shadow-pop active:cursor-grabbing sm:left-1 sm:px-2',
                          drag?.id === block.id && 'opacity-50',
                          block.done && 'opacity-70',
                        )}
                        style={{
                          top,
                          height,
                          // En el día, las tareas con hora tienen su carril a la derecha;
                          // en la semana son un punto pequeño y no quitan ancho.
                          right:
                            mode === 'day' && dayTasks.length
                              ? 'calc(clamp(104px, 30%, 240px) + 8px)'
                              : '2px',
                          borderLeftColor: tint,
                          background: `color-mix(in srgb, ${tint} 16%, var(--surface))`,
                        }}
                      >
                        <p
                          className={cn(
                            'text-2xs font-semibold leading-tight sm:text-xs',
                            short ? 'truncate' : 'line-clamp-3 sm:line-clamp-2',
                            block.done ? 'text-ink-3 line-through' : 'text-ink',
                          )}
                        >
                          {block.title}
                        </p>
                        {!short && !narrow ? (
                          <p className="tnum mt-0.5 truncate text-2xs text-ink-3">
                            {formatClock(block.start)} - {formatClock(block.end)}
                            {blockSubject ? ` · ${subjectShort(blockSubject)}` : ''}
                          </p>
                        ) : null}
                        {!short ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              dispatch({ type: 'patchBlock', id: block.id, patch: { done: !block.done } })
                            }}
                            aria-label={
                              block.done
                                ? t('planner.reopen', { title: block.title })
                                : t('planner.markDone', { title: block.title })
                            }
                            className={cn(
                              'absolute bottom-1 right-1 items-center justify-center rounded-md border transition-colors',
                              narrow ? 'hidden h-5 w-5 md:flex' : 'flex h-5 w-5',
                              block.done
                                ? 'border-transparent text-white'
                                : 'border-line-strong text-transparent hover:border-ink-3 hover:text-ink-3',
                            )}
                            style={block.done ? { background: tint } : undefined}
                          >
                            <Check size={11} strokeWidth={3} />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}

                  {/* Tareas con hora. Discontinuo para que nunca se lean como
                      un bloque de agenda. */}
                  {dayTasks.map((task) => {
                    const start = minutesFromClock(task.dueTime as string)
                    const top = ((start - rangeStart) / 60) * HOUR_H
                    const label = t('planner.dueAt', {
                      title: task.title,
                      time: formatClock(task.dueTime as string),
                    })

                    // En la semana la columna no da para texto: un círculo
                    // discontinuo marca la hora y el nombre sale al pulsarlo.
                    if (mode === 'week') {
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setDetailTask(task)}
                          title={label}
                          aria-label={label}
                          className="absolute right-0 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-surface/80 transition-colors hover:bg-surface-2"
                          style={{ top: Math.max(0, top) }}
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 rounded-full border border-dashed',
                              task.status === 'done' ? 'border-line-strong' : 'border-ink-3',
                            )}
                          />
                        </button>
                      )
                    }

                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setDetailTask(task)}
                        title={label}
                        className={cn(
                          'absolute right-1 z-10 w-[clamp(104px,30%,240px)] overflow-hidden rounded-md border border-dashed bg-surface px-1.5 py-1 text-left transition-colors hover:bg-surface-2',
                          task.status === 'done' ? 'border-line text-ink-3' : 'border-line-strong',
                        )}
                        style={{ top: Math.max(0, top), height: 48 }}
                      >
                        <p className="tnum text-2xs leading-[1.2] text-ink-3">
                          {formatClock(task.dueTime as string)}
                        </p>
                        {/* Dos líneas: a una sola, un título en español se
                            quedaba en el 20% incluso en la vista de día. */}
                        <p
                          className={cn(
                            'line-clamp-2 text-2xs font-medium leading-[1.2]',
                            task.status === 'done' ? 'text-ink-3 line-through' : 'text-ink-2',
                          )}
                        >
                          {task.title}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Hacer clic y arrastrar es cosa del ratón: en el móvil no tiene sentido. */}
      <p className="mt-3 hidden text-xs text-ink-3 md:block">{t('planner.tip')}</p>

      <BlockEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        block={editing}
        defaults={defaults}
      />
      <TaskDetail
        task={detailTask}
        onClose={() => setDetailTask(null)}
        onEdit={(t) => {
          setDetailTask(null)
          setEditingTask(t)
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
