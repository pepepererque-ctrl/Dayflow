import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { MAX_BREAKS } from '@/lib/constants'
import { isValidISODate } from '@/lib/date'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { BreakPeriod } from '@/types'

interface Row {
  id: string
  label: string
  from: string
  to: string
}

/** Periodo de clases y días sin clase (festivos, vacaciones, semanas de exámenes). */
export function TermEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()

  const [termStart, setTermStart] = useState('')
  const [termEnd, setTermEnd] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<{ term?: string; breaks?: string }>({})

  useEffect(() => {
    if (!open) return
    const tt = state.timetable
    setTermStart(tt.termStart ?? '')
    setTermEnd(tt.termEnd ?? '')
    setRows(tt.breaks.map((b) => ({ id: b.id, label: b.label, from: b.from, to: b.to })))
    setErrors({})
    // Solo al abrir: reajustar mientras se escribe pisaría lo tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patchRow = (id: string, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setErrors((e) => ({ ...e, breaks: undefined }))
  }

  const save = () => {
    const found: typeof errors = {}
    if (termStart && termEnd && termEnd < termStart) found.term = t('termEditor.errOrder')

    const breaks: BreakPeriod[] = []
    for (const row of rows) {
      // Una fila en blanco es un «Añadir» que no se llegó a usar: se ignora.
      if (!row.from && !row.to && !row.label.trim()) continue
      // Con solo «desde» se entiende que es un único día.
      const to = row.to || row.from
      if (!isValidISODate(row.from) || !isValidISODate(to) || to < row.from) {
        found.breaks = t('termEditor.errBreak')
        break
      }
      breaks.push({ id: row.id, label: row.label.trim(), from: row.from, to })
    }
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    dispatch({
      type: 'patchTimetable',
      patch: {
        termStart: termStart || null,
        termEnd: termEnd || null,
        breaks: breaks.sort((a, b) => a.from.localeCompare(b.from)),
      },
    })
    toast(t('termEditor.saved'))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('termEditor.title')}
      description={t('termEditor.sub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('termEditor.start')} htmlFor="term-start">
              <TextInput
                id="term-start"
                type="date"
                value={termStart}
                onChange={(e) => {
                  setTermStart(e.target.value)
                  setErrors((x) => ({ ...x, term: undefined }))
                }}
              />
            </Field>
            <Field label={t('termEditor.end')} htmlFor="term-end" error={errors.term}>
              <TextInput
                id="term-end"
                type="date"
                value={termEnd}
                onChange={(e) => {
                  setTermEnd(e.target.value)
                  setErrors((x) => ({ ...x, term: undefined }))
                }}
                aria-invalid={Boolean(errors.term)}
              />
            </Field>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">{t('termEditor.hint')}</p>
        </div>

        <Field label={t('termEditor.breaks')} hint={t('termEditor.breaksHint')} error={errors.breaks}>
          <div className="space-y-2">
            {rows.length === 0 ? <p className="text-sm text-ink-3">{t('termEditor.noBreaks')}</p> : null}
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-line bg-surface-2 p-2.5 sm:grid-cols-[1fr_9.5rem_9.5rem_auto]"
              >
                <TextInput
                  value={row.label}
                  onChange={(e) => patchRow(row.id, { label: e.target.value })}
                  placeholder={t('termEditor.labelPlaceholder')}
                  aria-label={t('termEditor.breaks')}
                  autoComplete="off"
                  maxLength={60}
                  className="col-span-1"
                />
                <button
                  type="button"
                  onClick={() => setRows((list) => list.filter((r) => r.id !== row.id))}
                  aria-label={t('termEditor.removeBreak', { label: row.label || t('termEditor.unnamed') })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-bad/10 hover:text-bad sm:order-last"
                >
                  <X size={15} />
                </button>
                <TextInput
                  type="date"
                  value={row.from}
                  onChange={(e) => patchRow(row.id, { from: e.target.value })}
                  aria-label={t('termEditor.from')}
                />
                <TextInput
                  type="date"
                  value={row.to}
                  onChange={(e) => patchRow(row.id, { to: e.target.value })}
                  aria-label={t('termEditor.to')}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              disabled={rows.length >= MAX_BREAKS}
              onClick={() => setRows((list) => [...list, { id: uid('brk'), label: '', from: '', to: '' }])}
            >
              <Plus size={14} />
              {t('termEditor.addBreak')}
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}
