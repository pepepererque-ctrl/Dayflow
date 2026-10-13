import { useMemo, useRef, useState } from 'react'
import { Columns3, ListFilter, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Count } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select, TextInput } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { CATEGORIES, CATEGORY_KEYS, PRIORITIES, PRIORITY_KEYS, STATUSES, STATUS_ORDER } from '@/lib/constants'
import { addDays } from '@/lib/date'
import { useApp } from '@/store/AppStore'
import type { CategoryKey, Priority, Task, TaskStatus } from '@/types'
import { TaskCard, TaskRow } from './TaskRow'
import { TaskDetail } from './TaskDetail'
import { TaskEditor } from './TaskEditor'
import { useT } from '@/i18n/I18nProvider'
import { isOverdue, quickAddTask } from './taskUtils'

type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none'
type View = 'list' | 'board'

interface Filters {
  search: string
  priority: Priority | 'any'
  category: CategoryKey | 'any'
  subject: string
  status: TaskStatus | 'any'
  due: DueFilter
}

/** How many completed tasks the list view shows before collapsing. */
const DONE_PREVIEW = 8

const EMPTY_FILTERS: Filters = { search: '', priority: 'any', category: 'any', subject: 'any', status: 'any', due: 'any' }

function matches(task: Task, f: Filters, today: string): boolean {
  if (f.search) {
    const needle = f.search.toLowerCase()
    if (!task.title.toLowerCase().includes(needle) && !task.notes.toLowerCase().includes(needle)) {
      return false
    }
  }
  if (f.priority !== 'any' && task.priority !== f.priority) return false
  if (f.category !== 'any' && task.category !== f.category) return false
  if (f.subject !== 'any' && task.subjectId !== f.subject) return false
  if (f.status !== 'any' && task.status !== f.status) return false

  switch (f.due) {
    case 'overdue':
      return isOverdue(task, today)
    case 'today':
      return task.dueDate === today
    case 'week':
      return Boolean(task.dueDate) && (task.dueDate as string) <= addDays(today, 7) && (task.dueDate as string) >= today
    case 'none':
      return task.dueDate === null
    default:
      return true
  }
}

export function TasksPage() {
  const { state, dispatch, today } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()

  const [view, setView] = useState<View>('list')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [detail, setDetail] = useState<Task | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [quick, setQuick] = useState('')
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('today')
  const [showAllDone, setShowAllDone] = useState(false)
  const [drag, setDrag] = useState<{ id: string; status: TaskStatus } | null>(null)
  const [dropAt, setDropAt] = useState<{ status: TaskStatus; index: number } | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () => state.tasks.filter((t) => matches(t, filters, today)),
    [state.tasks, filters, today],
  )

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>()
    for (const status of STATUS_ORDER) {
      map.set(
        status,
        filtered.filter((t) => t.status === status).sort((a, b) => a.order - b.order),
      )
    }
    return map
  }, [filtered])

  const activeFilterCount =
    (filters.priority !== 'any' ? 1 : 0) +
    (filters.category !== 'any' ? 1 : 0) +
    (filters.subject !== 'any' ? 1 : 0) +
    (filters.status !== 'any' ? 1 : 0) +
    (filters.due !== 'any' ? 1 : 0)

  const openEditor = (task: Task | null, status: TaskStatus = 'today') => {
    setEditing(task)
    setNewTaskStatus(task?.status ?? status)
    setEditorOpen(true)
    setDetail(null)
  }

  const removeTask = async (task: Task) => {
    const ok = await confirm({
      title: t('tasks.deleteTitle'),
      message: t('tasks.deleteBody', { title: task.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteTask', id: task.id })
    toast(t('tasks.deleted'), { tone: 'info' })
  }

  const submitQuick = () => {
    const title = quick.trim()
    if (!title) return
    dispatch({
      type: 'addTask',
      task: quickAddTask(title, filters.status === 'any' ? 'today' : filters.status, {
        today,
        subjects: state.subjects,
      }),
    })
    setQuick('')
    toast(t('tasks.added'))
    quickRef.current?.focus()
  }

  /* ------------------------------ drag & drop ----------------------------- */

  const onDrop = (status: TaskStatus, index: number) => {
    if (!drag) return
    dispatch({ type: 'moveTask', id: drag.id, status, index })
    if (drag.status !== status) {
      toast(t('tasks.movedTo', { column: t(STATUSES[status].labelKey) }))
    }
    setDrag(null)
    setDropAt(null)
  }

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle', {
          open: state.tasks.filter((x) => x.status !== 'done').length,
          done: state.tasks.filter((x) => x.status === 'done').length,
        })}
        actions={
          <>
            <Segmented
              ariaLabel={t('tasks.viewLabel')}
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: t('tasks.list'), icon: <ListFilter size={14} /> },
                { value: 'board', label: t('tasks.board'), icon: <Columns3 size={14} /> },
              ]}
            />
            <Button variant="primary" onClick={() => openEditor(null)}>
              <Plus size={16} />
              {t('tasks.new')}
            </Button>
          </>
        }
      />

      {/* ------------------------------ toolbar ------------------------------ */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <TextInput
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder={t('tasks.search')}
              className="pl-9"
              aria-label={t('tasks.searchLabel')}
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                aria-label={t('tasks.clearSearch')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <Button
            variant={showFilters || activeFilterCount ? 'soft' : 'secondary'}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={15} />
            {t('tasks.filters')}
            {activeFilterCount ? <Count value={activeFilterCount} /> : null}
          </Button>
        </div>

        {showFilters ? (
          <Card className="animate-[pop_0.18s_cubic-bezier(0.22,1,0.36,1)_both] p-3">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                aria-label={t('tasks.filterPriority')}
                value={filters.priority}
                onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as Priority | 'any' }))}
              >
                <option value="any">{t('tasks.anyPriority')}</option>
                {PRIORITY_KEYS.map((p) => (
                  <option key={p} value={p}>
                    {t(PRIORITIES[p].labelKey)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t('tasks.filterCategory')}
                value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value as CategoryKey | 'any' }))}
              >
                <option value="any">{t('tasks.anyCategory')}</option>
                {CATEGORY_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {t(CATEGORIES[c].labelKey)}
                  </option>
                ))}
              </Select>
              {state.subjects.length ? (
                <Select
                  aria-label={t('tasks.filterSubject')}
                  value={filters.subject}
                  onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
                >
                  <option value="any">{t('tasks.anySubject')}</option>
                  {state.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Select
                aria-label={t('tasks.filterStatus')}
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as TaskStatus | 'any' }))}
              >
                <option value="any">{t('tasks.anyStatus')}</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUSES[s].labelKey)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t('tasks.filterDue')}
                value={filters.due}
                onChange={(e) => setFilters((f) => ({ ...f, due: e.target.value as DueFilter }))}
              >
                <option value="any">{t('tasks.anyDue')}</option>
                <option value="overdue">{t('tasks.dueOverdue')}</option>
                <option value="today">{t('tasks.dueToday')}</option>
                <option value="week">{t('tasks.dueWeek')}</option>
                <option value="none">{t('tasks.dueNone')}</option>
              </Select>
            </div>
            {activeFilterCount || filters.search ? (
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <RotateCcw size={13} />
                  {t('tasks.resetFilters')}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* ------------------------------- views ------------------------------- */}
      {view === 'list' ? (
        <div className="space-y-4">
          <Card className="p-2">
            <div className="flex items-center gap-2">
              <Plus size={16} className="ml-2 shrink-0 text-ink-3" />
              <input
                ref={quickRef}
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitQuick()
                }}
                placeholder={t('tasks.quickAdd')}
                aria-label={t('tasks.quickAddLabel')}
                className="h-9 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              />
              {quick.trim() ? (
                <Button size="sm" variant="primary" onClick={submitQuick}>
                  {t('common.add')}
                </Button>
              ) : null}
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search size={20} />}
                title={state.tasks.length ? t('tasks.noMatchTitle') : t('tasks.emptyTitle')}
                description={state.tasks.length ? t('tasks.noMatchBody') : t('tasks.emptyBody')}
                action={
                  state.tasks.length ? (
                    <Button size="sm" variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                      {t('tasks.resetFilters')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => openEditor(null)}>
                      <Plus size={15} />
                      {t('tasks.new')}
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            STATUS_ORDER.map((status) => {
              const items = byStatus.get(status) ?? []
              if (!items.length) return null
              // The Done column grows without bound, so collapse it by default.
              const collapsed = status === 'done' && !showAllDone && items.length > DONE_PREVIEW
              const shown = collapsed ? items.slice(0, DONE_PREVIEW) : items
              return (
                <Card key={status} className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                    <h2 className="text-sm font-semibold text-ink">{t(STATUSES[status].labelKey)}</h2>
                    <Count value={items.length} />
                    <span className="hidden text-xs text-ink-3 sm:inline">{t(STATUSES[status].hintKey)}</span>
                  </div>
                  <div className="p-1.5">
                    {shown.map((task) => (
                      <TaskRow key={task.id} task={task} onOpen={setDetail} onDelete={removeTask} showDate />
                    ))}
                  </div>
                  {status === 'done' && items.length > DONE_PREVIEW ? (
                    <button
                      type="button"
                      onClick={() => setShowAllDone((v) => !v)}
                      className="w-full border-t border-line py-2.5 text-xs font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      {collapsed ? t('tasks.showAllDone', { n: items.length }) : t('tasks.showFewer')}
                    </button>
                  ) : null}
                </Card>
              )
            })
          )}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0">
          <div className="flex min-w-max gap-4 xl:min-w-0">
            {STATUS_ORDER.map((status) => {
              const items = byStatus.get(status) ?? []
              const isDropTarget = dropAt?.status === status
              return (
                <div
                  key={status}
                  className={cn(
                    'flex w-[280px] shrink-0 flex-col rounded-2xl border bg-surface-2/60 transition-colors xl:w-auto xl:flex-1',
                    isDropTarget ? 'border-brand bg-brand-soft/40' : 'border-line',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (drag && !dropAt) setDropAt({ status, index: items.length })
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    onDrop(status, dropAt?.status === status ? dropAt.index : items.length)
                  }}
                >
                  <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-ink">{t(STATUSES[status].labelKey)}</h2>
                      <Count value={items.length} />
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditor(null, status)}
                      aria-label={t('tasks.addToColumn', { column: t(STATUSES[status].labelKey) })}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2.5 pb-3">
                    {items.map((task, index) => (
                      <div key={task.id}>
                        {dropAt?.status === status && dropAt.index === index ? (
                          <div className="mb-2 h-0.5 rounded-full bg-brand" />
                        ) : null}
                        <TaskCard
                          task={task}
                          onOpen={setDetail}
                          dragging={drag?.id === task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', task.id)
                            setDrag({ id: task.id, status: task.status })
                          }}
                          onDragEnd={() => {
                            setDrag(null)
                            setDropAt(null)
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!drag) return
                            const rect = e.currentTarget.getBoundingClientRect()
                            const after = e.clientY > rect.top + rect.height / 2
                            setDropAt({ status, index: after ? index + 1 : index })
                          }}
                        />
                      </div>
                    ))}
                    {dropAt?.status === status && dropAt.index >= items.length ? (
                      <div className="h-0.5 rounded-full bg-brand" />
                    ) : null}
                    {!items.length ? (
                      <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-3">
                        {drag ? t('tasks.dropHere') : t(STATUSES[status].hintKey)}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <TaskDetail task={detail} onClose={() => setDetail(null)} onEdit={openEditor} />
      <TaskEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        task={editing}
        defaultStatus={newTaskStatus}
        defaultDate={filters.due === 'today' ? today : undefined}
      />
    </>
  )
}
