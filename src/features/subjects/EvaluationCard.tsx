import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Layers,
  ListChecks,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { MAX_EVAL_ITEMS } from '@/lib/constants'
import { diffDays, formatClock, formatShortDate } from '@/lib/date'
import {
  PASS_GRADE,
  computeGrades,
  formatGrade,
  groupGrades,
  leafGroups,
  requiredFor,
  type GroupGrade,
} from '@/lib/grades'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import type { EvalItem, Subject } from '@/types'
import { EvalItemEditor } from './EvalItemEditor'
import { GroupsEditor } from './GroupsEditor'

const TARGETS = ['5', '6', '7', '8', '9', '10']

/**
 * Nota editable en la propia fila: se guarda al salir del campo o con Intro.
 * Una nota fuera de 0-10 no se acepta y el campo vuelve a su valor.
 */
function GradeInput({
  value,
  label,
  onCommit,
  onInvalid,
  low,
}: {
  value: number | null
  label: string
  onCommit: (grade: number | null) => void
  onInvalid: () => void
  low: boolean
}) {
  const shown = value === null ? '' : formatGrade(value)
  const [text, setText] = useState(shown)

  // Si la nota cambia desde otro sitio (el editor, la nube), el campo la sigue.
  useEffect(() => setText(shown), [shown])

  const commit = () => {
    const raw = text.trim().replace(',', '.')
    if (raw === '') {
      if (value !== null) onCommit(null)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      setText(shown)
      onInvalid()
      return
    }
    const rounded = Math.round(n * 100) / 100
    setText(formatGrade(rounded))
    if (rounded !== value) onCommit(rounded)
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(shown)
          e.currentTarget.blur()
        }
      }}
      inputMode="decimal"
      placeholder="—"
      aria-label={label}
      aria-invalid={low}
      className={cn(
        'tnum h-9 w-[4.25rem] shrink-0 rounded-lg border bg-surface text-center text-base font-semibold text-ink',
        'placeholder:font-normal placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150',
        'hover:border-ink-3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--brand-ring)]',
        low ? 'border-bad text-bad' : 'border-line-strong',
      )}
    />
  )
}

function Stat({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="eyebrow truncate">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-2xs text-ink-3">{hint}</p> : null}
    </div>
  )
}

export function EvaluationCard({ subject }: { subject: Subject }) {
  const { dispatch, today } = useApp()
  const { toast } = useToast()
  const t = useT()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<EvalItem | null>(null)
  const [newInGroup, setNewInGroup] = useState<string | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [target, setTarget] = useState('7')

  const grades = useMemo(() => computeGrades(subject), [subject])
  const targetNum = Number(target)
  const need = useMemo(() => requiredFor(subject, targetNum), [subject, targetNum])
  const byGroup = useMemo(() => groupGrades(subject), [subject])
  const atLimit = subject.evaluation.length >= MAX_EVAL_ITEMS
  const grouped = subject.groups.length > 0
  // Partes que no están en ningún sitio (sin bloque, o de un bloque que ya no existe).
  const placedIds = useMemo(() => new Set(leafGroups(subject).map((p) => p.group.id)), [subject])
  const ungrouped = subject.evaluation.filter((e) => !e.groupId || !placedIds.has(e.groupId))

  const openEditor = (item: EvalItem | null, groupId: string | null = null) => {
    if (!item && atLimit) {
      toast(t('eval.limit'), { tone: 'error' })
      return
    }
    setEditing(item)
    setNewInGroup(groupId)
    setEditorOpen(true)
  }

  const setGrade = (id: string, grade: number | null) =>
    dispatch({
      type: 'patchSubject',
      id: subject.id,
      patch: { evaluation: subject.evaluation.map((e) => (e.id === id ? { ...e, grade } : e)) },
    })

  const setRecovery = (groupId: string, recovery: number | null) =>
    dispatch({
      type: 'patchSubject',
      id: subject.id,
      patch: { groups: subject.groups.map((g) => (g.id === groupId ? { ...g, recovery } : g)) },
    })

  // Con todo evaluado, la asignatura tiene veredicto: se ofrece reflejarlo en su estado.
  const verdict =
    grades.complete && grades.final !== null
      ? grades.final >= PASS_GRADE && !grades.belowMin.length
        ? 'passed'
        : 'failed'
      : null
  const markVerdict = () => {
    if (!verdict) return
    dispatch({ type: 'patchSubject', id: subject.id, patch: { status: verdict } })
    toast(t('eval.statusUpdated'))
  }

  const target1 = formatGrade(targetNum)
  const countdown = (days: number) =>
    days === 0
      ? t('exams.countToday')
      : days === 1
        ? t('exams.countTomorrow')
        : t('exams.countDays', { n: days })

  /** Una parte: nombre, peso, mínimo, fecha y su nota editable. */
  const renderItem = (item: EvalItem, weightLabel: string) => {
    const low = grades.belowMin.some((b) => b.id === item.id)
    return (
      <li
        key={item.id}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
      >
        <button
          type="button"
          onClick={() => openEditor(item)}
          aria-label={t('eval.editItem', { name: item.name })}
          className="-my-1 min-w-0 flex-1 py-1 text-left"
        >
          <p className="truncate text-base font-medium text-ink">{item.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-3">
            <span className="tnum font-medium text-ink-2">{weightLabel}</span>
            {item.minGrade !== null ? (
              <span className={cn('tnum', low && 'font-medium text-bad')}>
                {low
                  ? t('eval.belowMin', { min: formatGrade(item.minGrade) })
                  : t('eval.min', { n: formatGrade(item.minGrade) })}
              </span>
            ) : null}
            {item.date ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} />
                {formatShortDate(item.date)}
                {item.exam && item.time ? ` · ${formatClock(item.time)}` : ''}
                {item.exam && item.grade === null && diffDays(item.date, today) >= 0
                  ? ` · ${countdown(diffDays(item.date, today))}`
                  : ''}
              </span>
            ) : null}
          </p>
        </button>
        <GradeInput
          value={item.grade}
          label={t('eval.gradeLabel', { name: item.name })}
          low={low}
          onCommit={(grade) => setGrade(item.id, grade)}
          onInvalid={() => toast(t('eval.gradeInvalid'), { tone: 'error' })}
        />
      </li>
    )
  }

  /** Un bloque: su peso y su media arriba, sus partes debajo y la recuperación al final. */
  const renderGroup = (gg: GroupGrade) => {
    const { group } = gg
    const summary = gg.score !== null
      ? t('groups.score', { n: formatGrade(gg.score) })
      : gg.average !== null
        ? t('groups.average', { n: formatGrade(gg.average) })
        : t('groups.noGrades')
    return (
      <section key={group.id} className="mt-3 px-2" aria-label={group.name}>
        <div className="flex items-center gap-2 px-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-ink">{group.name}</h3>
            <p className="tnum mt-0.5 text-xs text-ink-3">
              {t('groups.ofFinal', { n: formatGrade(group.weight) })} ·{' '}
              <span className={cn(gg.score !== null && 'font-medium text-ink-2')}>{summary}</span>
              {gg.recovered ? ` · ${t('groups.recovered')}` : ''}
            </p>
          </div>
          {gg.sections.length === 0 ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('groups.addToGroup', { name: group.name })}
              onClick={() => openEditor(null, group.id)}
            >
              <Plus size={14} />
            </Button>
          ) : null}
        </div>
        {gg.sections.length ? (
          // Un bloque con apartados («Exámenes», «Trabajos»…): cada uno con su peso, su media y sus partes.
          gg.sections.map((section) => (
            <div key={section.group.id} className="mt-2 border-l-2 border-line pl-2" role="group" aria-label={section.group.name}>
              <div className="flex items-center gap-2 px-2">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-semibold uppercase tracking-wide text-ink-2">
                    {section.group.name}
                  </h4>
                  <p className="tnum mt-0.5 text-xs text-ink-3">
                    {t('groups.sectionOfBlock', { n: formatGrade(section.group.weight) })} ·{' '}
                    {section.average !== null
                      ? t('groups.average', { n: formatGrade(section.average) })
                      : t('groups.noGrades')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('groups.addToGroup', { name: `${group.name} · ${section.group.name}` })}
                  onClick={() => openEditor(null, section.group.id)}
                >
                  <Plus size={14} />
                </Button>
              </div>
              {section.items.length ? (
                <ul className="mt-1">
                  {section.items.map((item) => renderItem(item, t('groups.inSection', { n: formatGrade(item.weight) })))}
                </ul>
              ) : (
                <p className="px-2 pb-1 pt-1 text-xs text-ink-3">{t('groups.emptySection')}</p>
              )}
            </div>
          ))
        ) : gg.items.length ? (
          <ul className="mt-1">
            {gg.items.map((item) => renderItem(item, t('groups.inGroup', { n: formatGrade(item.weight) })))}
          </ul>
        ) : (
          <p className="px-2 pb-1 pt-2 text-xs text-ink-3">{t('groups.emptyGroup')}</p>
        )}
        {gg.complete || group.recovery !== null ? (
          <div className="mt-1 flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-2">{t('groups.recovery')}</p>
              <p className="mt-0.5 text-xs text-ink-3">{t('groups.recoveryHint')}</p>
            </div>
            <GradeInput
              value={group.recovery}
              label={t('groups.recoveryLabel', { name: group.name })}
              low={false}
              onCommit={(grade) => setRecovery(group.id, grade)}
              onInvalid={() => toast(t('eval.gradeInvalid'), { tone: 'error' })}
            />
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <Card>
      <CardHeader
        title={t('eval.title')}
        icon={<ListChecks size={16} />}
        subtitle={
          grades.hasData
            ? t('eval.subtitle', { n: subject.evaluation.length, total: formatGrade(grades.totalWeight) })
            : undefined
        }
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setGroupsOpen(true)}>
              <Layers size={14} />
              {t('groups.manage')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openEditor(null)}>
              <Plus size={14} />
              {t('eval.add')}
            </Button>
          </div>
        }
      />

      {!grades.hasData ? (
        <EmptyState
          compact
          icon={<ListChecks size={18} />}
          title={t('eval.emptyTitle')}
          description={t('eval.emptyBody')}
          action={
            <Button size="sm" variant="primary" onClick={() => openEditor(null)}>
              <Plus size={14} />
              {t('eval.add')}
            </Button>
          }
        />
      ) : (
        <div className="pb-4 pt-3">
          {/* ------------------------------ resumen ------------------------------ */}
          <div className="mx-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface-2/60">
            {grades.complete && grades.final !== null ? (
              <Stat label={t('eval.statFinal')} value={formatGrade(grades.final)} />
            ) : (
              <Stat
                label={t('eval.statCurrent')}
                hint={t('eval.statCurrentHint')}
                value={grades.average === null ? '—' : formatGrade(grades.average)}
              />
            )}
            <Stat label={t('eval.statMax')} value={formatGrade(grades.maxPossible)} />
            <Stat label={t('eval.statDone')} value={`${formatGrade(Math.round(grades.gradedPercent))} %`} />
          </div>

          {grades.weightsOff ? (
            <p className="mx-4 mt-3 flex items-start gap-2 text-xs text-warn">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {t('eval.weightMismatch', { total: formatGrade(grades.totalWeight) })}
            </p>
          ) : null}

          {/* ------------------------------- partes ------------------------------ */}
          {grouped ? (
            <>
              {byGroup.map(renderGroup)}
              {ungrouped.length ? (
                <section className="mt-3 px-2" aria-label={t('groups.noGroup')}>
                  <div className="px-2">
                    <h3 className="text-sm font-semibold text-ink">{t('groups.noGroup')}</h3>
                    <p className="mt-0.5 text-xs text-ink-3">{t('groups.noGroupHint')}</p>
                  </div>
                  <ul className="mt-1">
                    {ungrouped.map((item) => renderItem(item, t('eval.weight', { n: formatGrade(item.weight) })))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <ul className="mt-3 px-2">
              {subject.evaluation.map((item) => renderItem(item, t('eval.weight', { n: formatGrade(item.weight) })))}
            </ul>
          )}

          {/* ------------------------------ veredicto ---------------------------- */}
          {verdict && subject.status !== verdict ? (
            <div className="mx-4 mt-2 flex justify-end">
              <Button size="sm" variant="soft" onClick={markVerdict}>
                <CheckCircle2 size={14} />
                {verdict === 'passed' ? t('eval.markPassed') : t('eval.markFailed')}
              </Button>
            </div>
          ) : null}

          {/* ----------------------------- calculadora --------------------------- */}
          <div className="mx-4 mt-4 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Calculator size={15} className="text-ink-3" />
                {t('eval.calcTitle')}
              </h3>
              <Segmented
                size="sm"
                ariaLabel={t('eval.calcTarget')}
                value={target}
                onChange={setTarget}
                options={TARGETS.map((n) => ({ value: n, label: n }))}
              />
            </div>

            <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2" aria-live="polite">
              {need.kind === 'empty' ? <p>{t('eval.calcNoData')}</p> : null}

              {need.kind === 'blocked' ? (
                <p className="font-medium text-bad">
                  {t('eval.calcBlocked', { names: need.items.map((i) => `«${i.name}»`).join(', ') })}
                </p>
              ) : null}

              {need.kind === 'done' ? (
                <p>
                  {t('eval.calcDone', { final: formatGrade(need.final) })}{' '}
                  <span className={need.reaches ? 'font-medium text-good' : 'font-medium text-bad'}>
                    {need.reaches ? t('eval.calcReached', { target: target1 }) : t('eval.calcMissed', { target: target1 })}
                  </span>
                </p>
              ) : null}

              {need.kind === 'impossible' ? (
                <p className="font-medium text-bad">
                  {t('eval.calcImpossible', { target: target1, max: formatGrade(need.max) })}
                </p>
              ) : null}

              {need.kind === 'secured' ? (
                <p>
                  <span className="font-medium text-good">{t('eval.calcSecured', { target: target1 })}</span>
                  {need.perItem.some((p) => p.grade > 0) ? ` ${t('eval.calcSecuredMins')}` : ''}
                </p>
              ) : null}

              {need.kind === 'needs' ? (
                <p>
                  {t('eval.calcNeeds', { target: target1, grade: formatGrade(need.grade) })}
                </p>
              ) : null}

              {(need.kind === 'needs' || need.kind === 'secured') && need.perItem.length > 1 ? (
                <div className="pt-1">
                  <p className="eyebrow mb-1.5">{t('eval.calcPerItem')}</p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {need.perItem.map(({ item, grade }) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 truncate text-ink">
                          {item.name}
                          <span className="tnum ml-2 text-xs text-ink-3">
                            {t('eval.weight', { n: formatGrade(item.weight) })}
                          </span>
                        </span>
                        <span className="tnum shrink-0 font-semibold text-ink">{formatGrade(grade)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <EvalItemEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
          setNewInGroup(null)
        }}
        subject={subject}
        item={editing}
        defaultGroupId={newInGroup}
      />
      <GroupsEditor open={groupsOpen} onClose={() => setGroupsOpen(false)} subject={subject} />
    </Card>
  )
}
