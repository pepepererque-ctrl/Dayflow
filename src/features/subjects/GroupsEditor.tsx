import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { MAX_EVAL_GROUPS } from '@/lib/constants'
import { formatGrade } from '@/lib/grades'
import { uid } from '@/lib/id'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { EvalGroup, Subject } from '@/types'

interface Row {
  id: string
  name: string
  weight: string
}

const parseNumber = (text: string): number => Number(text.trim().replace(',', '.'))
const round2 = (n: number) => Math.round(n * 100) / 100

const toRows = (groups: EvalGroup[]): Row[] =>
  groups.map((g) => ({ id: g.id, name: g.name, weight: String(g.weight).replace('.', ',') }))

/** Plantillas habituales; el peso se puede cambiar después. */
const PRESETS: Array<{ key: string; rows: Array<{ name: string; weight: number }> }> = [
  {
    key: 'trimesters',
    rows: [
      { name: '1.er trimestre', weight: 33 },
      { name: '2.º trimestre', weight: 33 },
      { name: '3.er trimestre', weight: 34 },
    ],
  },
  {
    key: 'exams',
    rows: [
      { name: 'Exámenes', weight: 80 },
      { name: 'Trabajos', weight: 20 },
    ],
  },
  {
    key: 'evals',
    rows: [
      { name: '1.ª evaluación', weight: 50 },
      { name: '2.ª evaluación', weight: 50 },
    ],
  },
]

/**
 * Los bloques de la evaluación de una asignatura: trimestres, «Exámenes» y «Trabajos»…
 * Cada bloque pesa sobre la nota final; las partes de dentro se reparten el peso del bloque.
 */
export function GroupsEditor({
  open,
  onClose,
  subject,
}: {
  open: boolean
  onClose: () => void
  subject: Subject
}) {
  const { dispatch } = useApp()
  const { toast } = useToast()
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() => toRows(subject.groups))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!open) return
    setRows(toRows(subject.groups))
    setInvalid(false)
  }, [open, subject.groups])

  const update = (id: string, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setInvalid(false)
  }

  const total = rows.reduce((sum, r) => {
    const w = parseNumber(r.weight)
    return sum + (Number.isFinite(w) && w > 0 ? w : 0)
  }, 0)
  const off = rows.length > 0 && Math.abs(total - 100) > 0.01

  const submit = () => {
    const parsed = rows.map((r) => ({ ...r, w: parseNumber(r.weight) }))
    if (parsed.some((r) => !r.name.trim() || !Number.isFinite(r.w) || r.w <= 0 || r.w > 100)) {
      setInvalid(true)
      return
    }
    const previous = new Map(subject.groups.map((g) => [g.id, g]))
    const groups: EvalGroup[] = parsed.map((r) => ({
      id: r.id,
      name: r.name.trim().slice(0, 60),
      weight: round2(r.w),
      recovery: previous.get(r.id)?.recovery ?? null,
    }))
    const kept = new Set(groups.map((g) => g.id))
    dispatch({
      type: 'patchSubject',
      id: subject.id,
      patch: {
        groups,
        // Las partes de un bloque que se quita se quedan sin bloque, no desaparecen.
        evaluation: subject.evaluation.map((e) => (e.groupId && !kept.has(e.groupId) ? { ...e, groupId: null } : e)),
      },
    })
    toast(t('groups.saved'))
    onClose()
  }

  const removed = subject.groups.filter((g) => !rows.some((r) => r.id === g.id))
  const orphaned = subject.evaluation.filter((e) => removed.some((g) => g.id === e.groupId)).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('groups.title')}
      description={t('groups.sub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <div>
            <p className="text-sm text-ink-2">{t('groups.presetsTitle')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setRows(
                      preset.rows.map((r) => ({ id: uid('grp'), name: r.name, weight: String(r.weight) })),
                    )
                  }
                >
                  {t(`groups.preset.${preset.key}` as 'groups.preset.trimesters')}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">{t('groups.flatHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={row.id} className="flex items-center gap-2">
                <TextInput
                  value={row.name}
                  onChange={(e) => update(row.id, { name: e.target.value })}
                  placeholder={t('groups.namePlaceholder', { n: index + 1 })}
                  aria-label={t('groups.name')}
                  maxLength={60}
                  autoComplete="off"
                  className="min-w-0 flex-1"
                />
                <div className="relative w-24 shrink-0">
                  <TextInput
                    value={row.weight}
                    onChange={(e) => update(row.id, { weight: e.target.value })}
                    inputMode="decimal"
                    aria-label={t('groups.weight')}
                    placeholder="25"
                    className="pr-7 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">
                    %
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('groups.remove', { name: row.name || String(index + 1) })}
                  onClick={() => setRows((list) => list.filter((r) => r.id !== row.id))}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={rows.length >= MAX_EVAL_GROUPS}
              onClick={() => setRows((list) => [...list, { id: uid('grp'), name: '', weight: '' }])}
            >
              <Plus size={14} />
              {t('groups.add')}
            </Button>
            <p className={off ? 'tnum text-xs font-medium text-warn' : 'tnum text-xs text-ink-3'}>
              {t('groups.total', { n: formatGrade(total) })}
            </p>
          </div>
        ) : null}

        {off ? (
          <p className="flex items-start gap-2 text-xs text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {t('groups.proportional')}
          </p>
        ) : null}

        {orphaned > 0 ? (
          <p className="flex items-start gap-2 text-xs text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {t('groups.orphans', { n: orphaned })}
          </p>
        ) : null}

        {invalid ? (
          <p className="text-xs font-medium text-bad" role="alert">
            {t('groups.invalid')}
          </p>
        ) : null}

        {rows.length > 0 ? <p className="text-xs leading-relaxed text-ink-3">{t('groups.explain')}</p> : null}
      </div>
    </Modal>
  )
}
