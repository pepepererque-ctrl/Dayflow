import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { BLOCK_CATEGORIES, BLOCK_CATEGORY_KEYS, colorVar } from '@/lib/constants'
import { isValidClock, isValidISODate, minutesFromClock } from '@/lib/date'
import { uid } from '@/lib/id'
import { isOpenSubject } from '@/lib/subjects'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { BlockCategory, TimeBlock } from '@/types'

interface Draft {
  title: string
  date: string
  start: string
  end: string
  category: BlockCategory
  subjectId: string
  notes: string
}

type Errors = Partial<Record<keyof Draft, string>>

export function BlockEditor({
  open,
  onClose,
  block,
  defaults,
}: {
  open: boolean
  onClose: () => void
  block: TimeBlock | null
  defaults?: {
    date: string
    start: string
    end: string
    /** Para abrirlo ya rellenado desde el cuadro rápido de la agenda. */
    title?: string
    subjectId?: string
    category?: BlockCategory
  }
}) {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()
  const [draft, setDraft] = useState<Draft>({
    title: defaults?.title ?? '',
    date: defaults?.date ?? '',
    start: defaults?.start ?? '09:00',
    end: defaults?.end ?? '10:00',
    category: defaults?.category ?? 'deep_work',
    subjectId: defaults?.subjectId ?? '',
    notes: '',
  })
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(
      block
        ? {
            title: block.title,
            date: block.date,
            start: block.start,
            end: block.end,
            category: block.category,
            subjectId: block.subjectId ?? '',
            notes: block.notes,
          }
        : {
            title: defaults?.title ?? '',
            date: defaults?.date ?? '',
            start: defaults?.start ?? '09:00',
            end: defaults?.end ?? '10:00',
            category: defaults?.category ?? 'deep_work',
            subjectId: defaults?.subjectId ?? '',
            notes: '',
          },
    )
  }, [open, block, defaults])

  const submit = () => {
    const found: Errors = {}
    if (!draft.title.trim()) found.title = t('blockEditor.errTitle')
    if (!isValidISODate(draft.date)) found.date = t('blockEditor.errDate')
    if (!isValidClock(draft.start)) found.start = t('blockEditor.errTime')
    if (!isValidClock(draft.end)) found.end = t('blockEditor.errTime')
    if (!found.start && !found.end && minutesFromClock(draft.end) <= minutesFromClock(draft.start)) {
      found.end = t('blockEditor.errOrder')
    }
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const payload = {
      title: draft.title.trim(),
      date: draft.date,
      start: draft.start,
      end: draft.end,
      category: draft.category,
      subjectId: draft.subjectId || null,
      notes: draft.notes.trim(),
    }

    if (block) {
      dispatch({ type: 'patchBlock', id: block.id, patch: payload })
      toast(t('blockEditor.updated'))
    } else {
      dispatch({ type: 'addBlock', block: { id: uid('blk'), done: false, examId: null, ...payload } })
      toast(t('blockEditor.added'))
    }
    onClose()
  }

  const remove = async () => {
    if (!block) return
    const ok = await confirm({
      title: t('blockEditor.deleteTitle'),
      message: t('blockEditor.deleteBody', { title: block.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteBlock', id: block.id })
    toast(t('blockEditor.deleted'), { tone: 'info' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={block ? t('blockEditor.editTitle') : t('blockEditor.newTitle')}
      description={block ? undefined : t('blockEditor.newSub')}
      footer={
        <>
          {block ? (
            <>
              <Button variant="danger" size="sm" onClick={remove}>
                <Trash2 size={14} />
                {t('common.delete')}
              </Button>
              <div className="flex-1" />
            </>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {block ? t('common.save') : t('blockEditor.add')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('blockEditor.title')} htmlFor="block-title" error={errors.title} required>
          <TextInput
            id="block-title"
            value={draft.title}
            onChange={(e) => {
              setDraft((d) => ({ ...d, title: e.target.value }))
              setErrors((x) => ({ ...x, title: undefined }))
            }}
            placeholder={t('blockEditor.titlePlaceholder')}
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
          />
        </Field>

        <Field label={t('blockEditor.category')}>
          <div className="flex flex-wrap gap-2">
            {BLOCK_CATEGORY_KEYS.map((key) => {
              const meta = BLOCK_CATEGORIES[key]
              const active = draft.category === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, category: key }))}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                    active ? 'border-transparent' : 'border-line text-ink-2 hover:border-line-strong',
                  )}
                  style={
                    active
                      ? {
                          background: `color-mix(in srgb, ${colorVar(meta.color)} 15%, transparent)`,
                          color: colorVar(meta.color),
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: colorVar(meta.color) }}
                    aria-hidden="true"
                  />
                  {t(meta.labelKey)}
                </button>
              )
            })}
          </div>
        </Field>

        {state.subjects.length ? (
          <Field label={t('blockEditor.subject')} htmlFor="block-subject" hint={t('blockEditor.subjectHint')}>
            <Select
              id="block-subject"
              value={draft.subjectId}
              onChange={(e) => setDraft((d) => ({ ...d, subjectId: e.target.value }))}
            >
              <option value="">{t('blockEditor.noSubject')}</option>
              {state.subjects
                .filter((s) => isOpenSubject(s) || s.id === draft.subjectId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Field label={t('blockEditor.date')} htmlFor="block-date" error={errors.date}>
            <TextInput
              id="block-date"
              type="date"
              value={draft.date}
              onChange={(e) => {
                setDraft((d) => ({ ...d, date: e.target.value }))
                setErrors((x) => ({ ...x, date: undefined }))
              }}
              aria-invalid={Boolean(errors.date)}
            />
          </Field>
          <Field label={t('blockEditor.start')} htmlFor="block-start" error={errors.start}>
            <TextInput
              id="block-start"
              type="time"
              value={draft.start}
              onChange={(e) => {
                setDraft((d) => ({ ...d, start: e.target.value }))
                setErrors((x) => ({ ...x, start: undefined, end: undefined }))
              }}
              aria-invalid={Boolean(errors.start)}
            />
          </Field>
          <Field label={t('blockEditor.end')} htmlFor="block-end" error={errors.end}>
            <TextInput
              id="block-end"
              type="time"
              value={draft.end}
              onChange={(e) => {
                setDraft((d) => ({ ...d, end: e.target.value }))
                setErrors((x) => ({ ...x, end: undefined }))
              }}
              aria-invalid={Boolean(errors.end)}
            />
          </Field>
        </div>

        <Field label={t('blockEditor.notes')} htmlFor="block-notes">
          <TextArea
            id="block-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder={t('blockEditor.notesPlaceholder')}
          />
        </Field>
      </div>
    </Modal>
  )
}
