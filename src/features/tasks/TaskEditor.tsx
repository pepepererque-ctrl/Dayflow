import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { CATEGORIES, CATEGORY_KEYS, PRIORITIES, PRIORITY_KEYS, STATUSES, STATUS_ORDER } from '@/lib/constants'
import { isValidClock } from '@/lib/date'
import { isOpenSubject } from '@/lib/subjects'
import { newTask, useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { CategoryKey, Priority, Task, TaskStatus } from '@/types'

interface Draft {
  title: string
  notes: string
  status: TaskStatus
  priority: Priority
  category: CategoryKey
  dueDate: string
  dueTime: string
  estimateMin: string
  goalId: string
  subjectId: string
}

function toDraft(task: Task | null, defaults?: Partial<Draft>): Draft {
  return {
    title: task?.title ?? defaults?.title ?? '',
    notes: task?.notes ?? '',
    status: task?.status ?? (defaults?.status as TaskStatus) ?? 'today',
    priority: task?.priority ?? defaults?.priority ?? 'medium',
    category: task?.category ?? defaults?.category ?? 'work',
    dueDate: task?.dueDate ?? (defaults?.dueDate ?? ''),
    dueTime: task?.dueTime ?? defaults?.dueTime ?? '',
    estimateMin: task?.estimateMin != null ? String(task.estimateMin) : (defaults?.estimateMin ?? ''),
    goalId: task?.goalId ?? defaults?.goalId ?? '',
    subjectId: task?.subjectId ?? defaults?.subjectId ?? '',
  }
}

type Errors = Partial<Record<keyof Draft, string>>

function validate(draft: Draft, t: ReturnType<typeof useT>): Errors {
  const errors: Errors = {}
  if (!draft.title.trim()) errors.title = t('taskEditor.errTitle')
  else if (draft.title.trim().length > 240) errors.title = t('taskEditor.errTitleLong')

  if (draft.dueTime && !isValidClock(draft.dueTime)) errors.dueTime = t('taskEditor.errTime')
  if (draft.dueTime && !draft.dueDate) errors.dueDate = t('taskEditor.errDate')

  if (draft.estimateMin) {
    const n = Number(draft.estimateMin)
    if (!Number.isFinite(n) || n <= 0) errors.estimateMin = t('taskEditor.errEstimate')
    else if (n > 1440) errors.estimateMin = t('taskEditor.errEstimateBig')
  }
  return errors
}

export function TaskEditor({
  open,
  onClose,
  task,
  defaultStatus = 'today',
  defaultDate,
  defaultGoalId,
  defaultSubjectId,
  defaultDraft,
}: {
  open: boolean
  onClose: () => void
  /** null means "create a new task". */
  task: Task | null
  defaultStatus?: TaskStatus
  defaultDate?: string
  /** Pre-links the new task to a goal, e.g. when added from a goal screen. */
  defaultGoalId?: string
  /** Pre-vincula la tarea nueva a una asignatura, p. ej. desde su pantalla. */
  defaultSubjectId?: string
  /** Campos con los que abrir una tarea nueva, p. ej. lo escrito en el cuadro rápido de la agenda. */
  defaultDraft?: Partial<Pick<Draft, 'title' | 'dueTime' | 'priority' | 'estimateMin' | 'category'>>
}) {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(task, {
      ...defaultDraft,
      status: defaultStatus,
      dueDate: defaultDate,
      goalId: defaultGoalId,
      subjectId: defaultSubjectId,
    }),
  )
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (open) {
      setDraft(
        toDraft(task, {
          ...defaultDraft,
          status: defaultStatus,
          dueDate: defaultDate,
          goalId: defaultGoalId,
          subjectId: defaultSubjectId,
        }),
      )
      setErrors({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, defaultStatus, defaultDate, defaultGoalId, defaultSubjectId, JSON.stringify(defaultDraft ?? {})])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const submit = () => {
    const found = validate(draft, t)
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const payload = {
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      status: draft.status,
      priority: draft.priority,
      category: draft.category,
      dueDate: draft.dueDate || null,
      dueTime: draft.dueTime || null,
      estimateMin: draft.estimateMin ? Number(draft.estimateMin) : null,
      goalId: draft.goalId || null,
      subjectId: draft.subjectId || null,
    }

    if (task) {
      const becameDone = draft.status === 'done' && task.status !== 'done'
      const leftDone = draft.status !== 'done' && task.status === 'done'
      dispatch({
        type: 'patchTask',
        id: task.id,
        patch: {
          ...payload,
          completedAt: becameDone
            ? new Date().toISOString()
            : leftDone
              ? null
              : task.completedAt,
        },
      })
      toast(t('tasks.updated'))
    } else {
      dispatch({
        type: 'addTask',
        task: newTask({
          ...payload,
          completedAt: null,
        }),
      })
      toast(t('tasks.added'))
    }
    onClose()
  }

  const activeGoals = state.goals.filter((g) => g.status !== 'completed')
  // Una asignatura ya cerrada solo se ofrece si la tarea ya estaba vinculada a ella.
  const subjectChoices = state.subjects.filter((s) => isOpenSubject(s) || s.id === draft.subjectId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? t('taskEditor.editTitle') : t('taskEditor.newTitle')}
      description={task ? undefined : t('taskEditor.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {task ? t('common.save') : t('taskEditor.addTask')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={t('taskEditor.task')} htmlFor="task-title" error={errors.title} required>
          <TextInput
            id="task-title"
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t('taskEditor.taskPlaceholder')}
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Field label={t('taskEditor.status')} htmlFor="task-status">
            <Select
              id="task-status"
              value={draft.status}
              onChange={(e) => set('status', e.target.value as TaskStatus)}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {t(STATUSES[s].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('taskEditor.priority')} htmlFor="task-priority">
            <Select
              id="task-priority"
              value={draft.priority}
              onChange={(e) => set('priority', e.target.value as Priority)}
            >
              {PRIORITY_KEYS.map((p) => (
                <option key={p} value={p}>
                  {t(PRIORITIES[p].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('taskEditor.category')} htmlFor="task-category">
            <Select
              id="task-category"
              value={draft.category}
              onChange={(e) => set('category', e.target.value as CategoryKey)}
            >
              {CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORIES[c].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Field label={t('taskEditor.dueDate')} htmlFor="task-date" error={errors.dueDate}>
            <TextInput
              id="task-date"
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              aria-invalid={Boolean(errors.dueDate)}
            />
          </Field>
          <Field label={t('taskEditor.dueTime')} htmlFor="task-time" error={errors.dueTime}>
            <TextInput
              id="task-time"
              type="time"
              value={draft.dueTime}
              onChange={(e) => set('dueTime', e.target.value)}
              aria-invalid={Boolean(errors.dueTime)}
            />
          </Field>
          <Field label={t('taskEditor.estimate')} htmlFor="task-estimate" error={errors.estimateMin}>
            <TextInput
              id="task-estimate"
              type="number"
              min={5}
              step={5}
              inputMode="numeric"
              value={draft.estimateMin}
              onChange={(e) => set('estimateMin', e.target.value)}
              placeholder="30"
              aria-invalid={Boolean(errors.estimateMin)}
            />
          </Field>
        </div>

        <Field
          label={t('taskEditor.subject')}
          htmlFor="task-subject"
          hint={subjectChoices.length ? t('taskEditor.subjectHint') : t('taskEditor.subjectHintEmpty')}
        >
          <Select
            id="task-subject"
            value={draft.subjectId}
            onChange={(e) => set('subjectId', e.target.value)}
            disabled={!subjectChoices.length}
          >
            <option value="">{t('taskEditor.noSubject')}</option>
            {subjectChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t('taskEditor.goal')}
          htmlFor="task-goal"
          hint={activeGoals.length ? t('taskEditor.goalHint') : t('taskEditor.goalHintEmpty')}
        >
          <Select
            id="task-goal"
            value={draft.goalId}
            onChange={(e) => set('goalId', e.target.value)}
            disabled={!activeGoals.length}
          >
            <option value="">{t('taskEditor.noGoal')}</option>
            {activeGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('taskEditor.notes')} htmlFor="task-notes">
          <TextArea
            id="task-notes"
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('taskEditor.notesPlaceholder')}
          />
        </Field>

        {/* Permite enviar con Intro sin duplicar el botón visible. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}
