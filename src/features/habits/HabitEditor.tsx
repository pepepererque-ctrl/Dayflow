import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { COLOR_KEYS, HABIT_ICON_KEYS, colorVar, habitIcon } from '@/lib/constants'
import { weekdayNarrow, weekdayShort } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import type { ColorKey, Habit, HabitFrequency } from '@/types'

interface Draft {
  name: string
  description: string
  icon: string
  color: ColorKey
  frequency: HabitFrequency
  targetDays: number[]
}

const BLANK: Draft = {
  name: '',
  description: '',
  icon: 'sprout',
  color: 'teal',
  frequency: 'daily',
  targetDays: [1, 3, 5],
}

export function HabitEditor({
  open,
  onClose,
  habit,
}: {
  open: boolean
  onClose: () => void
  habit: Habit | null
}) {
  const { dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setDraft(
      habit
        ? {
            name: habit.name,
            description: habit.description,
            icon: habit.icon,
            color: habit.color,
            frequency: habit.frequency,
            targetDays: habit.targetDays.length ? habit.targetDays : BLANK.targetDays,
          }
        : BLANK,
    )
  }, [open, habit])

  const submit = () => {
    const name = draft.name.trim()
    if (!name) {
      setError(t('habitEditor.errName'))
      return
    }
    if (draft.frequency === 'custom' && draft.targetDays.length === 0) {
      setError(t('habitEditor.errDays'))
      return
    }

    const targetDays =
      draft.frequency === 'custom' ? [...draft.targetDays].sort() : [0, 1, 2, 3, 4, 5, 6]

    if (habit) {
      dispatch({
        type: 'patchHabit',
        id: habit.id,
        patch: { ...draft, name, description: draft.description.trim(), targetDays },
      })
      toast(t('habitEditor.updated'))
    } else {
      dispatch({
        type: 'addHabit',
        habit: {
          id: uid('hab'),
          name,
          description: draft.description.trim(),
          icon: draft.icon,
          color: draft.color,
          frequency: draft.frequency,
          targetDays,
          createdAt: new Date().toISOString(),
          archived: false,
          log: [],
        },
      })
      toast(t('habitEditor.created'))
    }
    onClose()
  }

  const toggleDay = (day: number) =>
    setDraft((d) => ({
      ...d,
      targetDays: d.targetDays.includes(day)
        ? d.targetDays.filter((x) => x !== day)
        : [...d.targetDays, day],
    }))

  const PreviewIcon = habitIcon(draft.icon)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? t('habitEditor.editTitle') : t('habitEditor.newTitle')}
      description={habit ? undefined : t('habitEditor.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {habit ? t('common.save') : t('habitEditor.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 p-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${colorVar(draft.color)} 16%, transparent)`,
              color: colorVar(draft.color),
            }}
          >
            <PreviewIcon size={22} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-md font-semibold text-ink">
              {draft.name.trim() || t('habitEditor.preview')}
            </p>
            <p className="text-xs text-ink-3">
              {draft.frequency === 'daily'
                ? t('habitEditor.freqDaily')
                : draft.frequency === 'weekdays'
                  ? t('habitEditor.mondayToFriday')
                  : draft.targetDays.length
                    ? draft.targetDays
                        .slice()
                        .sort()
                        .map((d) => weekdayShort(d))
                        .join(', ')
                    : t('habitEditor.pickDays')}
            </p>
          </div>
        </div>

        <Field label={t('habitEditor.name')} htmlFor="habit-name" error={error} required>
          <TextInput
            id="habit-name"
            value={draft.name}
            onChange={(e) => {
              setDraft((d) => ({ ...d, name: e.target.value }))
              setError(null)
            }}
            placeholder={t('habitEditor.namePlaceholder')}
            aria-invalid={Boolean(error)}
            autoComplete="off"
          />
        </Field>

        <Field label={t('habitEditor.description')} htmlFor="habit-desc" hint={t('habitEditor.descriptionHint')}>
          <TextArea
            id="habit-desc"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder={t('habitEditor.descriptionPlaceholder')}
          />
        </Field>

        <Field label={t('habitEditor.frequency')}>
          <Segmented
            ariaLabel={t('habitEditor.frequency')}
            value={draft.frequency}
            onChange={(frequency: HabitFrequency) => setDraft((d) => ({ ...d, frequency }))}
            options={[
              { value: 'daily', label: t('habitEditor.freqDaily') },
              { value: 'weekdays', label: t('habitEditor.freqWeekdays') },
              { value: 'custom', label: t('habitEditor.freqCustom') },
            ]}
          />
        </Field>

        {draft.frequency === 'custom' ? (
          <Field label={t('habitEditor.targetDays')}>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                const active = draft.targetDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={active}
                    aria-label={weekdayShort(day)}
                    className={cn(
                      'h-10 w-10 rounded-xl border text-sm font-semibold transition-all',
                      active
                        ? 'border-brand bg-brand-solid text-[var(--on-brand)]'
                        : 'border-line-strong bg-surface text-ink-3 hover:border-ink-3 hover:text-ink',
                    )}
                  >
                    {weekdayNarrow(day)}
                  </button>
                )
              })}
            </div>
          </Field>
        ) : null}

        <Field label={t('habitEditor.icon')}>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
            {HABIT_ICON_KEYS.map((key) => {
              const Icon = habitIcon(key)
              const active = draft.icon === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, icon: key }))}
                  aria-pressed={active}
                  aria-label={t('habitEditor.iconLabel', { key })}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-xl border transition-all',
                    active
                      ? 'border-brand bg-brand-soft text-brand-ink'
                      : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2',
                  )}
                >
                  <Icon size={17} />
                </button>
              )
            })}
          </div>
        </Field>

        <Field label={t('habitEditor.colour')}>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((color) => {
              const active = draft.color === color
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, color }))}
                  aria-pressed={active}
                  aria-label={t('habitEditor.colourLabel', { key: color })}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{ background: colorVar(color) }}
                >
                  {active ? <Check size={16} className="text-white drop-shadow" strokeWidth={3} /> : null}
                </button>
              )
            })}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
