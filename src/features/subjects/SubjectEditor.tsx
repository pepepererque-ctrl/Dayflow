import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { COLOR_KEYS, SUBJECT_STATUSES, SUBJECT_STATUS_KEYS, colorVar } from '@/lib/constants'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ColorKey, Subject, SubjectStatus } from '@/types'

interface Draft {
  name: string
  code: string
  color: ColorKey
  credits: string
  term: string
  status: SubjectStatus
  professor: string
  room: string
  link: string
  notes: string
}

type Errors = Partial<Record<'name' | 'credits' | 'link', string>>

/** Primer color sin usar, para que las asignaturas nuevas no se parezcan entre sí. */
function nextColor(subjects: Subject[]): ColorKey {
  const used = new Set(subjects.map((s) => s.color))
  return COLOR_KEYS.find((c) => !used.has(c)) ?? COLOR_KEYS[subjects.length % COLOR_KEYS.length]
}

function toDraft(subject: Subject | null, subjects: Subject[], defaultTerm: string): Draft {
  return {
    name: subject?.name ?? '',
    code: subject?.code ?? '',
    color: subject?.color ?? nextColor(subjects),
    credits: subject ? String(subject.credits || '') : '',
    term: subject?.term ?? defaultTerm,
    status: subject?.status ?? 'active',
    professor: subject?.professor ?? '',
    room: subject?.room ?? '',
    link: subject?.link ?? '',
    notes: subject?.notes ?? '',
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function SubjectEditor({
  open,
  onClose,
  subject,
}: {
  open: boolean
  onClose: () => void
  /** null significa "crear una nueva". */
  subject: Subject | null
}) {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()

  // El periodo suele repetirse entre asignaturas: se propone el último usado.
  const lastTerm = state.subjects[state.subjects.length - 1]?.term ?? ''
  const [draft, setDraft] = useState<Draft>(() => toDraft(subject, state.subjects, lastTerm))
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(toDraft(subject, state.subjects, lastTerm))
    // Solo al abrir: reajustar mientras se escribe pisaría lo tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = () => {
    const found: Errors = {}
    if (!draft.name.trim()) found.name = t('subjectEditor.errName')
    if (draft.credits.trim()) {
      const n = Number(draft.credits.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 60) found.credits = t('subjectEditor.errCredits')
    }
    if (draft.link.trim() && !isHttpUrl(draft.link.trim())) found.link = t('subjectEditor.errLink')
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const payload = {
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase(),
      color: draft.color,
      credits: draft.credits.trim() ? Math.round(Number(draft.credits.replace(',', '.')) * 2) / 2 : 0,
      term: draft.term.trim(),
      status: draft.status,
      professor: draft.professor.trim(),
      room: draft.room.trim(),
      link: draft.link.trim(),
      notes: draft.notes.trim(),
    }

    if (subject) {
      dispatch({ type: 'patchSubject', id: subject.id, patch: payload })
      toast(t('subjectEditor.updated'))
    } else {
      dispatch({
        type: 'addSubject',
        subject: { id: uid('sub'), createdAt: new Date().toISOString(), evaluation: [], ...payload },
      })
      toast(t('subjectEditor.created'))
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={subject ? t('subjectEditor.editTitle') : t('subjectEditor.newTitle')}
      description={subject ? undefined : t('subjectEditor.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {subject ? t('common.save') : t('subjectEditor.create')}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label={t('subjectEditor.name')} htmlFor="sub-name" error={errors.name} required>
            <TextInput
              id="sub-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={t('subjectEditor.namePlaceholder')}
              aria-invalid={Boolean(errors.name)}
              autoComplete="off"
              maxLength={120}
            />
          </Field>
          <Field label={t('subjectEditor.code')} htmlFor="sub-code">
            <TextInput
              id="sub-code"
              value={draft.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder={t('subjectEditor.codePlaceholder')}
              autoComplete="off"
              maxLength={10}
              className="uppercase placeholder:normal-case"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('subjectEditor.credits')} htmlFor="sub-credits" error={errors.credits}>
            <TextInput
              id="sub-credits"
              inputMode="decimal"
              value={draft.credits}
              onChange={(e) => set('credits', e.target.value)}
              placeholder="6"
              aria-invalid={Boolean(errors.credits)}
            />
          </Field>
          <Field label={t('subjectEditor.term')} htmlFor="sub-term">
            <TextInput
              id="sub-term"
              value={draft.term}
              onChange={(e) => set('term', e.target.value)}
              placeholder={t('subjectEditor.termPlaceholder')}
              autoComplete="off"
              maxLength={40}
            />
          </Field>
          <Field label={t('subjectEditor.status')} htmlFor="sub-status">
            <Select
              id="sub-status"
              value={draft.status}
              onChange={(e) => set('status', e.target.value as SubjectStatus)}
            >
              {SUBJECT_STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {t(SUBJECT_STATUSES[s].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('subjectEditor.colour')}>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set('color', color)}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label={t('subjectEditor.professor')} htmlFor="sub-prof">
            <TextInput
              id="sub-prof"
              value={draft.professor}
              onChange={(e) => set('professor', e.target.value)}
              autoComplete="off"
              maxLength={120}
            />
          </Field>
          <Field label={t('subjectEditor.room')} htmlFor="sub-room">
            <TextInput
              id="sub-room"
              value={draft.room}
              onChange={(e) => set('room', e.target.value)}
              placeholder={t('subjectEditor.roomPlaceholder')}
              autoComplete="off"
              maxLength={60}
            />
          </Field>
        </div>

        <Field
          label={t('subjectEditor.link')}
          htmlFor="sub-link"
          error={errors.link}
          hint={t('subjectEditor.linkHint')}
        >
          <TextInput
            id="sub-link"
            type="url"
            inputMode="url"
            value={draft.link}
            onChange={(e) => set('link', e.target.value)}
            placeholder={t('subjectEditor.linkPlaceholder')}
            aria-invalid={Boolean(errors.link)}
            autoComplete="off"
          />
        </Field>

        <Field label={t('subjectEditor.notes')} htmlFor="sub-notes">
          <TextArea
            id="sub-notes"
            rows={3}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('subjectEditor.notesPlaceholder')}
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
