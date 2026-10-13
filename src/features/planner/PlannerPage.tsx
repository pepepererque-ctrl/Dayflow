import { useMemo, useRef, useState } from 'react'
import { CalendarRange, Check, ChevronLeft, ChevronRight, ClipboardCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { BLOCK_CATEGORIES, BLOCK_CATEGORY_KEYS, CLASS_KINDS, colorVar } from '@/lib/constants'
import {
  addDays,
  clockFromMinutes,
  dayOfWeek,
  formatClock,
  formatShortDate,
  minutesFromClock,
  nowClock,
  startOfWeek,
  weekDates,
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
/** Un examen no tiene duración guardada: se dibuja una hora desde que empieza. */
const EXAM_BLOCK_MIN = 60
const SNAP = 15
const DAY_MINUTES = 24 * 60

/**
 * La rejilla tiene alto fijo y la tarjeta recorta lo que se salga, así que el
 * rango debe cubrir también las tareas con hora: una tarea a las 21:30 caía
 * fuera y quedaba invisible y sin poder pulsarse.
 */
function clampRange(
  blocks: TimeBlock[],
  tasks: Task[],
  workStart: string,
  workEnd: string,
  classes: Array<{ start: number; end: number }> = [],
) {
  let min = Math.min(minutesFromClock(workStart), 8 * 60)
  let max = Math.max(minutesFromClock(workEnd), 19 * 60)
  for (const b of blocks) {
    min = Math.min(min, minutesFromClock(b.start))
    max = Math.max(max, minutesFromClock(b.end))
  }
  for (const c of classes) {
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

export function PlannerPage() {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const t = useT()

  const [anchor, setAnchor] = useState<ISODate>(today)
  // A 7-column grid needs horizontal scrolling on a phone, so start on one day.
  const [mode, setMode] = useState<'week' | 'day'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week',
  )
  const [editing, setEditing] = useState<TimeBlock | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [defaults, setDefaults] = useState<{ date: string; start: string; end: string } | undefined>()
  const [drag, setDrag] = useState<{ id: string; grabOffsetMin: number } | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const weekStartsOn = state.settings.weekStartsOn
  const days = useMemo(
    () => (mode === 'week' ? weekDates(anchor, weekStartsOn) : [anchor]),
    [anchor, mode, weekStartsOn],
  )
  const daySet = useMemo(() => new Set(days), [days])

  const visibleBlocks = useMemo(
    () => state.blocks.filter((b) => daySet.has(b.date)),
    [state.blocks, daySet],
  )

  const timedTasks = useMemo(
    () => state.tasks.filter((t) => t.dueTime && t.dueDate && daySet.has(t.dueDate)),
    [state.tasks, daySet],
  )

  // Las clases del horario se repiten solas: se calculan para los días visibles.
  const visibleClasses = useMemo(
    () => days.flatMap((d) => classesOn(state, d)),
    [days, state.subjects, state.timetable],
  )

  // Exámenes de los días visibles, pasados incluidos (con su nota, si ya la hay).
  const weekExams = useMemo(() => {
    const { upcoming, past } = listExams(state.subjects, today)
    return [...past, ...upcoming].filter((e) => daySet.has(e.date))
  }, [state.subjects, today, daySet])

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

  const weekLabel =
    mode === 'day'
      ? formatShortDate(anchor)
      : `${formatShortDate(days[0])} - ${formatShortDate(days[days.length - 1])}`

  const shift = (delta: number) =>
    setAnchor((a) => (mode === 'week' ? addDays(startOfWeek(a, weekStartsOn), delta * 7) : addDays(a, delta)))

  const nowMinutes = minutesFromClock(nowClock())
  const showNowLine = nowMinutes >= rangeStart && nowMinutes <= endHour * 60

  return (
    <>
      <PageHeader
        title={t('planner.title')}
        subtitle={t('planner.subtitle')}
        actions={
          <>
            <Segmented
              ariaLabel={t('planner.rangeLabel')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'week', label: t('common.week') },
                { value: 'day', label: t('common.day') },
              ]}
            />
            <Button variant="primary" onClick={() => openNew(mode === 'day' ? anchor : today, 9 * 60)}>
              <Plus size={16} />
              {t('planner.new')}
            </Button>
          </>
        }
      />

      {/* ------------------------------ controls ----------------------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon-sm" onClick={() => shift(-1)} aria-label={t('common.previous')}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(today)}>
            {t('common.today')}
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={() => shift(1)} aria-label={t('common.next')}>
            <ChevronRight size={16} />
          </Button>
          <span className="ml-2 text-base font-semibold text-ink">{weekLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {BLOCK_CATEGORY_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-2xs text-ink-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: colorVar(BLOCK_CATEGORIES[key].color) }}
              />
              {t(BLOCK_CATEGORIES[key].labelKey)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-2xs text-ink-3">
            <span className="h-2 w-2 rounded-full border border-dashed border-ink-3" />
            {t('planner.legendTask')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-2xs text-ink-3">
            <span
              className="h-2 w-3 rounded-sm border-l-2 border-ink-3"
              style={{ background: 'repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px)' }}
            />
            {t('planner.legendClass')}
          </span>
        </div>
      </div>

      {/* ------------------------------- grid -------------------------------- */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {/* Siete columnas necesitan scroll horizontal en el móvil; una sola
              cabe de sobra, así que no la forzamos a 640px. */}
          <div className={mode === 'week' ? 'min-w-[640px]' : 'min-w-0'}>
            {/* day headers */}
            <div
              className="sticky top-0 z-10 grid border-b border-line bg-surface"
              style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div />
              {days.map((date) => {
                const isToday = date === today
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setAnchor(date)
                      setMode('day')
                    }}
                    className={cn(
                      'flex flex-col items-center gap-0.5 border-l border-line py-2.5 transition-colors hover:bg-surface-2',
                    )}
                  >
                    <span className="eyebrow">
                      {weekdayShort(dayOfWeek(date))}
                    </span>
                    <span
                      className={cn(
                        'tnum flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                        isToday ? 'bg-brand-solid text-[var(--on-brand)]' : 'text-ink',
                      )}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* exámenes del día: siempre a la vista, tengan hora o no */}
            {weekExams.length ? (
              <div
                className="grid border-b border-line bg-surface"
                style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
              >
                <div />
                {days.map((date) => (
                  <div key={date} className="min-w-0 space-y-1 border-l border-line p-1">
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
                            className="flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-2xs font-semibold leading-tight"
                            style={{
                              color: tint,
                              background: `color-mix(in srgb, ${tint} 14%, transparent)`,
                              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 40%, transparent)`,
                            }}
                          >
                            <ClipboardCheck size={11} className="shrink-0" />
                            <span className="truncate">
                              {subjectShort(e.subject)} · {e.item.name}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                ))}
              </div>
            ) : null}

            {/* time grid */}
            <div
              ref={gridRef}
              className="relative grid"
              style={{
                gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`,
                height: gridHeight,
              }}
            >
              {/* hour gutter */}
              <div className="relative">
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-2 -translate-y-1/2 text-2xs tabular-nums text-ink-3"
                    style={{ top: i * HOUR_H }}
                  >
                    {i === 0 ? '' : formatClock(clockFromMinutes((startHour + i) * 60))}
                  </div>
                ))}
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
                    className="relative border-l border-line"
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
                    {/* hour lines + click-to-create slots */}
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

                    {/* current-time indicator */}
                    {date === today && showNowLine ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                        style={{ top: ((nowMinutes - rangeStart) / 60) * HOUR_H }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        <span className="h-px flex-1 bg-brand" />
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
                          className="pointer-events-none absolute z-[1] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5"
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
                            {subjectShort(c.subject)} · {t(CLASS_KINDS[c.slot.kind].labelKey)}
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
                            className="absolute inset-x-1 z-[5] overflow-hidden rounded-lg border-l-[3px] border-bad bg-bad/10 px-2 py-1 text-left"
                            style={{
                              top: ((start - rangeStart) / 60) * HOUR_H,
                              height: (EXAM_BLOCK_MIN / 60) * HOUR_H - 3,
                            }}
                          >
                            <p className="truncate text-xs font-semibold leading-tight text-bad">{e.item.name}</p>
                            <p className="tnum truncate text-2xs leading-tight text-ink-3">
                              {formatClock(e.item.time as string)}
                              {e.item.room ? ` · ${e.item.room}` : ''}
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
                            'absolute left-1 z-10 cursor-grab overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-shadow hover:shadow-pop active:cursor-grabbing',
                            drag?.id === block.id && 'opacity-50',
                            block.done && 'opacity-70',
                          )}
                          style={{
                            top,
                            height,
                            // El carril de tareas solo reserva ancho cuando
                            // muestra tarjetas; el marcador semanal cabe en 26px.
                            right: !dayTasks.length
                              ? '4px'
                              : mode === 'week'
                                ? '26px'
                                : 'calc(clamp(104px, 30%, 240px) + 8px)',
                            borderLeftColor: tint,
                            background: `color-mix(in srgb, ${tint} 13%, var(--surface))`,
                          }}
                        >
                          {/* Un bloque alto tiene sitio de sobra en vertical: dejar
                              que el título ocupe dos líneas cuesta menos que
                              recortarlo al 36% en la vista semanal. */}
                          <p
                            className={cn(
                              'text-xs font-semibold leading-tight',
                              short ? 'truncate' : 'line-clamp-2',
                              block.done ? 'text-ink-3 line-through' : 'text-ink',
                            )}
                          >
                            {block.title}
                          </p>
                          {!short ? (
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
                                'absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
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

                      // En vista semanal la columna deja ~25px de texto: el título
                      // salía cortado al 88% y hasta la hora se partía. Ahí la tarea
                      // es el mismo círculo discontinuo de la leyenda, y el nombre
                      // completo vive en el tooltip y a un clic de distancia.
                      if (mode === 'week') {
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setDetailTask(task)}
                            title={label}
                            aria-label={label}
                            className="absolute right-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
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

        {visibleBlocks.length === 0 && timedTasks.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              compact
              icon={<CalendarRange size={18} />}
              title={t('planner.emptyTitle')}
              description={t('planner.emptyBody')}
            />
          </div>
        ) : null}
      </Card>

      <p className="mt-3 text-xs text-ink-3">
        {t('planner.tip')}
      </p>

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
