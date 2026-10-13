import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { CLASS_KINDS, CLASS_KIND_KEYS, MAX_CLASS_SLOTS } from '@/lib/constants'
import { formatClock, isValidClock, minutesFromClock, weekdayLong, weekdayShort } from '@/lib/date'
import { uid } from '@/lib/id'
import { isOpenSubject, subjectShort } from '@/lib/subjects'
import { overlappingSlots } from '@/lib/timetable'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { ClassKind, ClassSlot } from '@/types'

interface Draft {
  subjectId: string
  days: number[]
  start: string
  end: string
  kind: ClassKind
  room: string
}

type Errors = Partial<Record<'subjectId' | 'days' | 'end', string>>

/** Suma una hora sin pasarse de las 23:59. */
function plusHour(clock: string): string {
  const total = Math.min(23 * 60 + 59, minutesFromClock(clock) + 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function SlotEditor({
  open,
  onClose,
  slot,
  defaults,
}: {
  open: boolean
  onClose: () => void
  /** null significa "crear clases nuevas". */
  slot: ClassSlot | null
  defaults?: { weekday?: number; start?: string; subjectId?: string }
}) {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()

  const blank = (): Draft => {
    const first = state.subjects.find(isOpenSubject)
    const start = defaults?.start ?? '09:00'
    const subjectId = defaults?.subjectId ?? first?.id ?? ''
    return {
      subjectId,
      days: defaults?.weekday !== undefined ? [defaults.weekday] : [],
      start,
      end: plusHour(start),
      kind: 'theory',
      room: state.subjects.find((s) => s.id === subjectId)?.room ?? '',
    }
  }

  const [draft, setDraft] = useState<Draft>(blank)
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(
      slot
        ? { subjectId: slot.subjectId, days: [slot.weekday], start: slot.start, end: slot.end, kind: slot.kind, room: slot.room }
        : blank(),
    )
    // Solo al abrir: reajustar mientras se escribe pisaría lo tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot, defaults])

  const choices = state.subjects.filter((s) => isOpenSubject(s) || s.id === draft.subjectId)
  const weekOrder = state.settings.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const toggleDay = (dow: number) => {
    // Al editar una clase suelta solo cabe un día; al crear se pueden marcar varios.
    setDraft((d) => ({
      ...d,
      days: slot ? [dow] : d.days.includes(dow) ? d.days.filter((x) => x !== dow) : [...d.days, dow],
    }))
    setErrors((e) => ({ ...e, days: undefined }))
  }

  const pickSubject = (id: string) => {
    const room = state.subjects.find((s) => s.id === id)?.room ?? ''
    // El aula de la asignatura se propone solo si aún no se ha escrito otra.
    setDraft((d) => ({ ...d, subjectId: id, room: d.room.trim() ? d.room : room }))
    setErrors((e) => ({ ...e, subjectId: undefined }))
  }

  const timesOk = isValidClock(draft.start) && isValidClock(draft.end) && draft.end > draft.start

  const clashes = useMemo(() => {
    if (!timesOk) return []
    return draft.days.flatMap((weekday) =>
      overlappingSlots(state.timetable.slots, { weekday, start: draft.start, end: draft.end }, slot?.id),
    )
  }, [draft.days, draft.start, draft.end, timesOk, state.timetable.slots, slot?.id])

  const describe = (s: ClassSlot) => {
    const subject = state.subjects.find((x) => x.id === s.subjectId)
    return `${subject ? subjectShort(subject) : '?'} (${weekdayShort(s.weekday)} ${formatClock(s.start)}-${formatClock(s.end)})`
  }

  const submit = () => {
    const found: Errors = {}
    if (!draft.subjectId) found.subjectId = t('slotEditor.errSubject')
    if (!draft.days.length) found.days = t('slotEditor.errDays')
    if (!timesOk) found.end = t('slotEditor.errTime')
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    const base = {
      subjectId: draft.subjectId,
      start: draft.start,
      end: draft.end,
      kind: draft.kind,
      room: draft.room.trim(),
    }

    if (slot) {
      dispatch({
        type: 'patchTimetable',
        patch: {
          slots: state.timetable.slots.map((s) =>
            s.id === slot.id ? { ...s, ...base, weekday: draft.days[0] } : s,
          ),
        },
      })
      toast(t('slotEditor.updated'))
    } else {
      if (state.timetable.slots.length + draft.days.length > MAX_CLASS_SLOTS) {
        toast(t('slotEditor.limit'), { tone: 'error' })
        return
      }
      const created: ClassSlot[] = draft.days.map((weekday) => ({ id: uid('cls'), weekday, ...base }))
      dispatch({ type: 'patchTimetable', patch: { slots: [...state.timetable.slots, ...created] } })
      toast(t('slotEditor.added', { n: created.length }))
    }
    onClose()
  }

  const remove = async () => {
    if (!slot) return
    const subject = state.subjects.find((s) => s.id === slot.subjectId)
    const ok = await confirm({
      title: t('slotEditor.deleteTitle'),
      message: t('slotEditor.deleteBody', {
        subject: subject?.name ?? '',
        when: `${weekdayLong(slot.weekday)} ${formatClock(slot.start)}-${formatClock(slot.end)}`,
      }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({
      type: 'patchTimetable',
      patch: { slots: state.timetable.slots.filter((s) => s.id !== slot.id) },
    })
    toast(t('slotEditor.deleted'), { tone: 'info' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={slot ? t('slotEditor.editTitle') : t('slotEditor.newTitle')}
      description={slot ? undefined : t('slotEditor.newSub')}
      footer={
        <>
          {slot ? (
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
            {slot ? t('common.save') : t('slotEditor.add')}
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
        <Field label={t('slotEditor.subject')} htmlFor="slot-subject" error={errors.subjectId} required>
          <Select
            id="slot-subject"
            value={draft.subjectId}
            onChange={(e) => pickSubject(e.target.value)}
            aria-invalid={Boolean(errors.subjectId)}
          >
            {!draft.subjectId ? <option value="" /> : null}
            {choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t('slotEditor.days')}
          error={errors.days}
          hint={slot ? undefined : t('slotEditor.daysHint')}
          required
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('slotEditor.days')}>
            {weekOrder.map((dow) => {
              const on = draft.days.includes(dow)
              return (
                <button
                  key={dow}
                  type="button"
                  aria-pressed={on}
                  aria-label={weekdayLong(dow)}
                  onClick={() => toggleDay(dow)}
                  className={cn(
                    'h-9 min-w-[2.75rem] rounded-xl border px-3 text-sm font-medium transition-colors first-letter:uppercase',
                    on
                      ? 'border-transparent bg-brand-soft text-brand-ink'
                      : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
                  )}
                >
                  {weekdayShort(dow)}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t('slotEditor.start')} htmlFor="slot-start">
            <TextInput
              id="slot-start"
              type="time"
              value={draft.start}
              onChange={(e) => set('start', e.target.value)}
            />
          </Field>
          <Field label={t('slotEditor.end')} htmlFor="slot-end" error={errors.end}>
            <TextInput
              id="slot-end"
              type="time"
              value={draft.end}
              onChange={(e) => set('end', e.target.value)}
              aria-invalid={Boolean(errors.end)}
            />
          </Field>
          <Field label={t('slotEditor.kind')} htmlFor="slot-kind">
            <Select id="slot-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as ClassKind)}>
              {CLASS_KIND_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(CLASS_KINDS[k].labelKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('slotEditor.room')} htmlFor="slot-room">
            <TextInput
              id="slot-room"
              value={draft.room}
              onChange={(e) => set('room', e.target.value)}
              placeholder={t('slotEditor.roomPlaceholder')}
              autoComplete="off"
              maxLength={40}
            />
          </Field>
        </div>

        {clashes.length ? (
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {t('slotEditor.overlap', { what: [...new Set(clashes.map(describe))].join(', ') })}
          </p>
        ) : null}

        {/* Permite enviar con Intro sin duplicar el botón visible. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}
