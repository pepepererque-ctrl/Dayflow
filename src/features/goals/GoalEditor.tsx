import { useEffect, useState } from 'react'
import { Check, GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { CATEGORIES, CATEGORY_KEYS, COLOR_KEYS, colorVar } from '@/lib/constants'
import { addDays, isValidISODate, todayISO } from '@/lib/date'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { CategoryKey, ColorKey, Goal, GoalStatus, Milestone } from '@/types'

interface Draft {
  title: string
  description: string
  category: CategoryKey
  color: ColorKey
  targetDate: string
  status: GoalStatus
  milestones: Milestone[]
}

function blank(): Draft {
  return {
    title: '',
    description: '',
    category: 'personal',
    color: 'indigo',
    targetDate: addDays(todayISO(), 90),
    status: 'active',
    milestones: [],
  }
}

type Errors = { title?: string; targetDate?: string; milestones?: string }

export function GoalEditor({
  open,
  onClose,
  goal,
}: {
  open: boolean
  onClose: () => void
  goal: Goal | null
}) {
  const { dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()
  const [draft, setDraft] = useState<Draft>(blank)
  const [errors, setErrors] = useState<Errors>({})
  const [newMilestone, setNewMilestone] = useState('')

  useEffect(() => {
    if (!open) return
    setErrors({})
    setNewMilestone('')
    setDraft(
      goal
        ? {
            title: goal.title,
            description: goal.description,
            category: goal.category,
            color: goal.color,
            targetDate: goal.targetDate,
            status: goal.status,
            milestones: goal.milestones.map((m) => ({ ...m })),
          }
        : blank(),
    )
  }, [open, goal])

  const addMilestone = () => {
    const title = newMilestone.trim()
    if (!title) return
    setDraft((d) => ({
      ...d,
      milestones: [
        ...d.milestones,
        { id: uid('ms'), title, done: false, targetDate: null, completedAt: null },
      ],
    }))
    setNewMilestone('')
    setErrors((e) => ({ ...e, milestones: undefined }))
  }

  const submit = () => {
    const found: Errors = {}
    if (!draft.title.trim()) found.title = t('goalEditor.errTitle')
    if (!isValidISODate(draft.targetDate)) found.targetDate = t('goalEditor.errDate')
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      color: draft.color,
      targetDate: draft.targetDate,
      status: draft.status,
      milestones: draft.milestones,
    }

    if (goal) {
      dispatch({ type: 'patchGoal', id: goal.id, patch: payload })
      toast(t('goalEditor.updated'))
    } else {
      dispatch({
        type: 'addGoal',
        goal: { id: uid('goal'), createdAt: new Date().toISOString(), ...payload },
      })
      toast(t('goalEditor.created'))
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={goal ? t('goalEditor.editTitle') : t('goalEditor.newTitle')}
      description={goal ? undefined : t('goalEditor.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {goal ? t('common.save') : t('goalEditor.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('goalEditor.goal')} htmlFor="goal-title" error={errors.title} required>
          <TextInput
            id="goal-title"
            value={draft.title}
            onChange={(e) => {
              setDraft((d) => ({ ...d, title: e.target.value }))
              setErrors((x) => ({ ...x, title: undefined }))
            }}
            placeholder={t('goalEditor.goalPlaceholder')}
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
          />
        </Field>

        <Field label={t('goalEditor.why')} htmlFor="goal-desc" hint={t('goalEditor.whyHint')}>
          <TextArea
            id="goal-desc"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder={t('goalEditor.whyPlaceholder')}
          />
        </Field>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Field label={t('goalEditor.category')} htmlFor="goal-category">
            <Select
              id="goal-category"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as CategoryKey }))}
            >
              {CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORIES[c].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('goalEditor.targetDate')} htmlFor="goal-date" error={errors.targetDate}>
            <TextInput
              id="goal-date"
              type="date"
              value={draft.targetDate}
              onChange={(e) => {
                setDraft((d) => ({ ...d, targetDate: e.target.value }))
                setErrors((x) => ({ ...x, targetDate: undefined }))
              }}
              aria-invalid={Boolean(errors.targetDate)}
            />
          </Field>
          <Field label={t('goalEditor.status')} htmlFor="goal-status">
            <Select
              id="goal-status"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as GoalStatus }))}
            >
              <option value="active">{t('goals.statusActive')}</option>
              <option value="paused">{t('goals.statusPaused')}</option>
              <option value="completed">{t('goals.statusCompleted')}</option>
            </Select>
          </Field>
        </div>

        <Field label={t('goalEditor.colour')}>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, color }))}
                aria-pressed={draft.color === color}
                aria-label={t('habitEditor.colourLabel', { key: color })}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
                style={{ background: colorVar(color) }}
              >
                {draft.color === color ? (
                  <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
                ) : null}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={t('goalEditor.milestones')}
          hint={t('goalEditor.milestonesHint')}
          error={errors.milestones}
        >
          <div className="space-y-2">
            {draft.milestones.map((m, index) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
              >
                <GripVertical size={14} className="shrink-0 text-ink-3" />
                <span className="tnum w-5 shrink-0 text-xs font-semibold text-ink-3">{index + 1}</span>
                <input
                  value={m.title}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      milestones: d.milestones.map((x) =>
                        x.id === m.id ? { ...x, title: e.target.value } : x,
                      ),
                    }))
                  }
                  aria-label={t('goals.milestoneN', { n: index + 1 })}
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, milestones: d.milestones.filter((x) => x.id !== m.id) }))
                  }
                  aria-label={t('goals.removeMilestone', { n: index + 1 })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-bad/10 hover:text-bad"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            <div className={cn('flex items-center gap-2', draft.milestones.length && 'pt-1')}>
              <TextInput
                value={newMilestone}
                onChange={(e) => setNewMilestone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMilestone()
                  }
                }}
                placeholder={t('goals.addMilestone')}
                aria-label={t('goals.newMilestone')}
              />
              <Button variant="secondary" onClick={addMilestone} disabled={!newMilestone.trim()}>
                <Plus size={15} />
                {t('common.add')}
              </Button>
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  )
}
