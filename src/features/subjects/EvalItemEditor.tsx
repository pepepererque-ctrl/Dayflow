import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { todayISO } from '@/lib/date'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { EvalItem, Subject } from '@/types'

/** Sugerencias del campo nombre: acelera teclear, pero se puede escribir cualquier cosa. */
const NAME_SUGGESTIONS = [
  'Parcial 1',
  'Parcial 2',
  'Examen final',
  'Prácticas',
  'Laboratorio',
  'Trabajo',
  'Proyecto',
  'Controles',
  'Test',
  'Participación',
]

interface Draft {
  name: string
  weight: string
  grade: string
  minGrade: string
  date: string
  exam: boolean
  time: string
  room: string
}

type Errors = Partial<Record<'name' | 'weight' | 'grade' | 'minGrade', string>>

const parseNumber = (text: string): number => Number(text.trim().replace(',', '.'))
const fmt = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))
const round2 = (n: number) => Math.round(n * 100) / 100

function toDraft(item: EvalItem | null): Draft {
  return {
    name: item?.name ?? '',
    weight: fmt(item?.weight ?? null),
    grade: fmt(item?.grade ?? null),
    minGrade: fmt(item?.minGrade ?? null),
    date: item?.date ?? '',
    // Lo más habitual al añadir una parte con fecha es que sea un examen.
    exam: item?.exam ?? true,
    time: item?.time ?? '',
    room: item?.room ?? '',
  }
}

export function EvalItemEditor({
  open,
  onClose,
  subject,
  item,
}: {
  open: boolean
  onClose: () => void
  subject: Subject
  /** null significa "crear una parte nueva". */
  item: EvalItem | null
}) {
  const { dispatch } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()
  const [draft, setDraft] = useState<Draft>(() => toDraft(item))
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(toDraft(item))
  }, [open, item])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = (evaluation: EvalItem[]) =>
    dispatch({ type: 'patchSubject', id: subject.id, patch: { evaluation } })

  const submit = () => {
    const found: Errors = {}
    if (!draft.name.trim()) found.name = t('evalEditor.errName')

    const weight = parseNumber(draft.weight)
    if (!draft.weight.trim() || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
      found.weight = t('evalEditor.errWeight')
    }
    const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10
    if (draft.grade.trim() && !inRange(parseNumber(draft.grade))) found.grade = t('evalEditor.errGrade')
    if (draft.minGrade.trim() && !inRange(parseNumber(draft.minGrade))) {
      found.minGrade = t('evalEditor.errMin')
    }
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const next: EvalItem = {
      id: item?.id ?? uid('ev'),
      name: draft.name.trim(),
      weight: round2(weight),
      grade: draft.grade.trim() ? round2(parseNumber(draft.grade)) : null,
      minGrade: draft.minGrade.trim() ? round2(parseNumber(draft.minGrade)) : null,
      date: draft.date || null,
      exam: draft.exam,
      time: draft.exam && draft.time ? draft.time : null,
      room: draft.exam ? draft.room.trim() : '',
    }

    if (item) {
      save(subject.evaluation.map((e) => (e.id === item.id ? next : e)))
      toast(t('evalEditor.updated'))
    } else {
      save([...subject.evaluation, next])
      toast(t('evalEditor.added'))
    }
    onClose()
  }

  const remove = async () => {
    if (!item) return
    const ok = await confirm({
      title: t('evalEditor.deleteTitle'),
      message: t('evalEditor.deleteBody', { name: item.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    save(subject.evaluation.filter((e) => e.id !== item.id))
    dispatch({ type: 'deleteStudyPlan', examId: item.id, from: todayISO() })
    toast(t('evalEditor.deleted'), { tone: 'info' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('evalEditor.editTitle') : t('evalEditor.newTitle')}
      description={item ? undefined : t('evalEditor.newSub')}
      footer={
        <>
          {item ? (
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
            {item ? t('common.save') : t('evalEditor.add')}
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
        <Field label={t('evalEditor.name')} htmlFor="eval-name" error={errors.name} required>
          <TextInput
            id="eval-name"
            list="eval-name-suggestions"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('evalEditor.namePlaceholder')}
            aria-invalid={Boolean(errors.name)}
            autoComplete="off"
            maxLength={80}
          />
          <datalist id="eval-name-suggestions">
            {NAME_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t('evalEditor.weight')}
            htmlFor="eval-weight"
            error={errors.weight}
            hint={t('evalEditor.weightHint')}
            required
          >
            <TextInput
              id="eval-weight"
              inputMode="decimal"
              value={draft.weight}
              onChange={(e) => set('weight', e.target.value)}
              placeholder="40"
              aria-invalid={Boolean(errors.weight)}
            />
          </Field>
          <Field
            label={t('evalEditor.grade')}
            htmlFor="eval-grade"
            error={errors.grade}
            hint={t('evalEditor.gradeHint')}
          >
            <TextInput
              id="eval-grade"
              inputMode="decimal"
              value={draft.grade}
              onChange={(e) => set('grade', e.target.value)}
              placeholder="—"
              aria-invalid={Boolean(errors.grade)}
            />
          </Field>
          <Field
            label={t('evalEditor.min')}
            htmlFor="eval-min"
            error={errors.minGrade}
            hint={t('evalEditor.minHint')}
          >
            <TextInput
              id="eval-min"
              inputMode="decimal"
              value={draft.minGrade}
              onChange={(e) => set('minGrade', e.target.value)}
              placeholder="4"
              aria-invalid={Boolean(errors.minGrade)}
            />
          </Field>
          <Field label={t('evalEditor.date')} htmlFor="eval-date" hint={t('evalEditor.dateHint')}>
            <TextInput
              id="eval-date"
              type="date"
              value={draft.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
        </div>

        <Checkbox
          checked={draft.exam}
          onChange={(next) => set('exam', next)}
          label={t('evalEditor.isExam')}
          description={t('evalEditor.isExamHint')}
        />

        {draft.exam ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('evalEditor.time')} htmlFor="eval-time">
              <TextInput
                id="eval-time"
                type="time"
                value={draft.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </Field>
            <Field label={t('evalEditor.room')} htmlFor="eval-room">
              <TextInput
                id="eval-room"
                value={draft.room}
                onChange={(e) => set('room', e.target.value)}
                placeholder={t('evalEditor.roomPlaceholder')}
                autoComplete="off"
                maxLength={40}
              />
            </Field>
          </div>
        ) : null}

        {/* Permite enviar con Intro sin duplicar el botón visible. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}
