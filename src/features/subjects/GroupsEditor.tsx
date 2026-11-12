import { useEffect, useState } from 'react'
import { AlertTriangle, CornerDownRight, Plus, Trash2 } from 'lucide-react'
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

/** Un bloque (trimestre…) con sus apartados («Exámenes», «Trabajos»…). */
interface BlockRow extends Row {
  sections: Row[]
}

const parseNumber = (text: string): number => Number(text.trim().replace(',', '.'))
const round2 = (n: number) => Math.round(n * 100) / 100
const asText = (n: number) => String(n).replace('.', ',')

const toRows = (groups: EvalGroup[]): BlockRow[] =>
  groups
    .filter((g) => !g.parentId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      weight: asText(g.weight),
      sections: groups
        .filter((s) => s.parentId === g.id)
        .map((s) => ({ id: s.id, name: s.name, weight: asText(s.weight) })),
    }))

const sectionsOf = (): Row[] => [
  { id: uid('grp'), name: 'Exámenes', weight: '80' },
  { id: uid('grp'), name: 'Trabajos', weight: '20' },
]

/** Plantillas habituales; los nombres y los pesos se cambian después. */
const PRESETS: Array<{ key: string; build: () => BlockRow[] }> = [
  {
    key: 'trimestersFull',
    build: () =>
      ['1.er trimestre', '2.º trimestre', '3.er trimestre'].map((name, i) => ({
        id: uid('grp'),
        name,
        weight: i === 2 ? '34' : '33',
        sections: sectionsOf(),
      })),
  },
  {
    key: 'trimesters',
    build: () =>
      ['1.er trimestre', '2.º trimestre', '3.er trimestre'].map((name, i) => ({
        id: uid('grp'),
        name,
        weight: i === 2 ? '34' : '33',
        sections: [],
      })),
  },
  {
    key: 'exams',
    build: () => [
      { id: uid('grp'), name: 'Exámenes', weight: '80', sections: [] },
      { id: uid('grp'), name: 'Trabajos', weight: '20', sections: [] },
    ],
  },
  {
    key: 'evals',
    build: () => [
      { id: uid('grp'), name: '1.ª evaluación', weight: '50', sections: [] },
      { id: uid('grp'), name: '2.ª evaluación', weight: '50', sections: [] },
    ],
  },
]

const sumWeights = (rows: Row[]) =>
  rows.reduce((sum, r) => {
    const w = parseNumber(r.weight)
    return sum + (Number.isFinite(w) && w > 0 ? w : 0)
  }, 0)

/** Una fila editable: nombre, porcentaje y papelera. */
function RowEditor({
  row,
  placeholder,
  nameLabel,
  weightLabel,
  removeLabel,
  indent,
  onChange,
  onRemove,
}: {
  row: Row
  placeholder: string
  nameLabel: string
  weightLabel: string
  removeLabel: string
  indent?: boolean
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  return (
    <div className={indent ? 'flex items-center gap-2 pl-3' : 'flex items-center gap-2'}>
      {indent ? <CornerDownRight size={14} className="shrink-0 text-ink-3" aria-hidden="true" /> : null}
      <TextInput
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={placeholder}
        aria-label={nameLabel}
        maxLength={60}
        autoComplete="off"
        className="min-w-0 flex-1"
      />
      <div className="relative w-24 shrink-0">
        <TextInput
          value={row.weight}
          onChange={(e) => onChange({ weight: e.target.value })}
          inputMode="decimal"
          aria-label={weightLabel}
          placeholder="25"
          className="pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>
      </div>
      <Button size="sm" variant="ghost" aria-label={removeLabel} onClick={onRemove}>
        <Trash2 size={15} />
      </Button>
    </div>
  )
}

/**
 * Los bloques de la evaluación de una asignatura: trimestres, y dentro de cada uno apartados
 * («Exámenes» 80 %, «Trabajos» 20 %). Cada bloque pesa sobre la nota final, cada apartado dentro
 * de su bloque y las partes dentro de su apartado.
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
  const [rows, setRows] = useState<BlockRow[]>(() => toRows(subject.groups))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!open) return
    setRows(toRows(subject.groups))
    setInvalid(false)
  }, [open, subject.groups])

  const count = rows.reduce((n, r) => n + 1 + r.sections.length, 0)
  const full = count >= MAX_EVAL_GROUPS

  const edit = (next: (list: BlockRow[]) => BlockRow[]) => {
    setRows(next)
    setInvalid(false)
  }
  const patchBlock = (id: string, patch: Partial<Row>) =>
    edit((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const patchSection = (blockId: string, id: string, patch: Partial<Row>) =>
    edit((list) =>
      list.map((r) =>
        r.id === blockId ? { ...r, sections: r.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : r,
      ),
    )

  const total = sumWeights(rows)
  const off = rows.length > 0 && Math.abs(total - 100) > 0.01
  const someWithoutSections = rows.some((r) => r.sections.length === 0)

  const submit = () => {
    const all = rows.flatMap((r) => [r, ...r.sections])
    if (all.some((r) => !r.name.trim() || !Number.isFinite(parseNumber(r.weight)) || parseNumber(r.weight) <= 0 || parseNumber(r.weight) > 100)) {
      setInvalid(true)
      return
    }
    const previous = new Map(subject.groups.map((g) => [g.id, g]))
    const groups: EvalGroup[] = rows.flatMap((r) => [
      {
        id: r.id,
        name: r.name.trim().slice(0, 60),
        weight: round2(parseNumber(r.weight)),
        recovery: previous.get(r.id)?.recovery ?? null,
        parentId: null,
      },
      ...r.sections.map((s) => ({
        id: s.id,
        name: s.name.trim().slice(0, 60),
        weight: round2(parseNumber(s.weight)),
        recovery: null,
        parentId: r.id,
      })),
    ])
    const kept = new Set(groups.map((g) => g.id))
    // Un bloque con apartados guarda las partes en ellos: las que ya tenía pasan al primero.
    const firstSection = new Map<string, string>()
    for (const g of groups) if (g.parentId && !firstSection.has(g.parentId)) firstSection.set(g.parentId, g.id)
    dispatch({
      type: 'patchSubject',
      id: subject.id,
      patch: {
        groups,
        // Las partes de un bloque o apartado que se quita se quedan sin bloque, no desaparecen.
        evaluation: subject.evaluation.map((e) => {
          if (!e.groupId || !kept.has(e.groupId)) return e.groupId ? { ...e, groupId: null } : e
          const target = firstSection.get(e.groupId)
          return target ? { ...e, groupId: target } : e
        }),
      },
    })
    toast(t('groups.saved'))
    onClose()
  }

  const keptIds = new Set(rows.flatMap((r) => [r.id, ...r.sections.map((s) => s.id)]))
  const orphaned = subject.evaluation.filter((e) => e.groupId && !keptIds.has(e.groupId)).length

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
                <Button key={preset.key} size="sm" variant="secondary" onClick={() => setRows(preset.build())}>
                  {t(`groups.preset.${preset.key}` as 'groups.preset.trimesters')}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">{t('groups.flatHint')}</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((block, index) => {
              const sectionsTotal = sumWeights(block.sections)
              return (
                <li key={block.id} className="space-y-2">
                  <RowEditor
                    row={block}
                    placeholder={t('groups.namePlaceholder', { n: index + 1 })}
                    nameLabel={t('groups.name')}
                    weightLabel={t('groups.weight')}
                    removeLabel={t('groups.remove', { name: block.name || String(index + 1) })}
                    onChange={(patch) => patchBlock(block.id, patch)}
                    onRemove={() => edit((list) => list.filter((r) => r.id !== block.id))}
                  />
                  {block.sections.map((section, i) => (
                    <RowEditor
                      key={section.id}
                      indent
                      row={section}
                      placeholder={t('groups.sectionPlaceholder', { n: i + 1 })}
                      nameLabel={t('groups.sectionName', { block: block.name || String(index + 1) })}
                      weightLabel={t('groups.sectionWeight', { block: block.name || String(index + 1) })}
                      removeLabel={t('groups.removeSection', { name: section.name || String(i + 1) })}
                      onChange={(patch) => patchSection(block.id, section.id, patch)}
                      onRemove={() =>
                        edit((list) =>
                          list.map((r) =>
                            r.id === block.id ? { ...r, sections: r.sections.filter((s) => s.id !== section.id) } : r,
                          ),
                        )
                      }
                    />
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={full}
                      onClick={() =>
                        edit((list) =>
                          list.map((r) =>
                            r.id === block.id
                              ? { ...r, sections: [...r.sections, { id: uid('grp'), name: '', weight: '' }] }
                              : r,
                          ),
                        )
                      }
                    >
                      <Plus size={14} />
                      {t('groups.addSection')}
                    </Button>
                    {block.sections.length > 0 ? (
                      <p
                        className={
                          Math.abs(sectionsTotal - 100) > 0.01 ? 'tnum text-xs font-medium text-warn' : 'tnum text-xs text-ink-3'
                        }
                      >
                        {t('groups.sectionsTotal', { n: formatGrade(sectionsTotal) })}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={full}
                onClick={() => edit((list) => [...list, { id: uid('grp'), name: '', weight: '', sections: [] }])}
              >
                <Plus size={14} />
                {t('groups.add')}
              </Button>
              {someWithoutSections ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={count + rows.filter((r) => r.sections.length === 0).length * 2 > MAX_EVAL_GROUPS}
                  onClick={() =>
                    edit((list) => list.map((r) => (r.sections.length === 0 ? { ...r, sections: sectionsOf() } : r)))
                  }
                >
                  {t('groups.bulk')}
                </Button>
              ) : null}
            </div>
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
