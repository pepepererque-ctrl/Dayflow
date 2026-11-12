import type { EvalGroup, EvalItem, Subject } from '@/types'

/** Lo que necesita el cálculo de una asignatura. `groups` puede faltar en datos antiguos. */
type Evaluable = Pick<Subject, 'evaluation'> & Partial<Pick<Subject, 'groups'>>

/** Nota mínima para aprobar en la escala 0-10. */
export const PASS_GRADE = 5

const EPS = 1e-9

/** 7,5 / 6,83: coma decimal y como mucho dos decimales. */
export function formatGrade(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

/** Redondea hacia arriba a 2 decimales, para que la nota pedida nunca se quede corta. */
const ceil2 = (n: number) => Math.ceil(n * 100 - EPS) / 100

export interface SubjectGrades {
  /** Hay partes con peso: sin esto no hay nada que calcular. */
  hasData: boolean
  totalWeight: number
  /** Los pesos suman algo distinto de 100: se calcula en proporción. */
  weightsOff: boolean
  /** Puntos ya conseguidos sobre 10, con los pesos normalizados. */
  points: number
  /** Media de lo ya evaluado sobre 10, o null si aún no hay ninguna nota. */
  average: number | null
  /** Máximo que se podría sacar si lo que falta sale de 10. */
  maxPossible: number
  /** Porcentaje (0-100) de la evaluación que ya tiene nota. */
  gradedPercent: number
  /** Todas las partes tienen nota. */
  complete: boolean
  /** Nota final si la evaluación está completa. */
  final: number | null
  /** Partes con nota por debajo de su mínimo: no hacen media. */
  belowMin: EvalItem[]
}

const virtualItem = (id: string, name: string, weight: number, grade: number | null): EvalItem => ({
  id,
  name,
  weight,
  groupId: null,
  grade,
  minGrade: null,
  date: null,
  exam: false,
  time: null,
  room: '',
})

/** Un sitio donde van partes: un apartado, o el propio bloque si no tiene apartados. */
interface Leaf {
  group: EvalGroup
  /** Peso de este sitio sobre la nota final (en las mismas unidades que `weight`). */
  share: number
  members: EvalItem[]
  /** Suma de los pesos de las partes de dentro, para repartir `share` entre ellas. */
  sum: number
}

interface Block {
  root: EvalGroup
  sections: EvalGroup[]
  leaves: Leaf[]
}

/**
 * Los bloques con su peso repartido: un bloque sin apartados guarda sus partes directamente;
 * uno con apartados reparte su peso entre ellos en proporción a lo que pese cada uno.
 */
function layout(subject: Evaluable): Block[] {
  const groups = subject.groups ?? []
  return groups
    .filter((g) => !g.parentId)
    .map((root) => {
      const sections = groups.filter((g) => g.parentId === root.id)
      const sectionTotal = sections.reduce((s, g) => s + g.weight, 0)
      const leaves = (sections.length ? sections : [root]).map((group) => {
        const members = subject.evaluation.filter((i) => i.groupId === group.id)
        return {
          group,
          share: sections.length && sectionTotal > 0 ? (root.weight * group.weight) / sectionTotal : root.weight,
          members,
          sum: members.reduce((s, i) => s + i.weight, 0),
        }
      })
      return { root, sections, leaves }
    })
}

/** Dónde se pueden poner partes: apartados, y bloques que no tienen apartados. Con el bloque al que pertenecen. */
export function leafGroups(subject: Evaluable): Array<{ group: EvalGroup; parent: EvalGroup | null }> {
  return layout(subject).flatMap((b): Array<{ group: EvalGroup; parent: EvalGroup | null }> =>
    b.sections.length ? b.sections.map((group) => ({ group, parent: b.root })) : [{ group: b.root, parent: null }],
  )
}

/**
 * Las partes de la asignatura con el peso que de verdad tienen sobre la nota final.
 *
 * Sin bloques es la propia lista. Con bloques, el peso de cada parte se reparte dentro de su
 * sitio (apartado o bloque) y ese sitio pesa lo que le toque: un examen del 40 % de un apartado
 * del 80 % de un trimestre del 25 % vale un 8 %. Un sitio sin partes cuenta como pendiente, y un
 * bloque con recuperación y todo evaluado se queda en una sola nota (la mayor entre su media y la
 * recuperación). Las partes sin sitio pesan por sí mismas sobre la nota final.
 */
export function effectiveItems(subject: Evaluable): EvalItem[] {
  if (!(subject.groups ?? []).length) return subject.evaluation

  const blocks = layout(subject)
  const placed = new Set(blocks.flatMap((b) => b.leaves.map((l) => l.group.id)))
  const out: EvalItem[] = []
  for (const block of blocks) {
    const entries: EvalItem[] = []
    let allGraded = true
    for (const leaf of block.leaves) {
      if (!leaf.members.length || leaf.sum <= 0) {
        const label = leaf.group === block.root ? block.root.name : `${block.root.name} · ${leaf.group.name}`
        entries.push(virtualItem(`${leaf.group.id}:empty`, label, leaf.share, null))
        allGraded = false
        continue
      }
      for (const item of leaf.members) {
        entries.push({ ...item, weight: (leaf.share * item.weight) / leaf.sum })
        if (item.grade === null) allGraded = false
      }
    }
    if (block.root.recovery !== null && allGraded) {
      const total = entries.reduce((s, i) => s + i.weight, 0)
      const average = total > 0 ? entries.reduce((s, i) => s + i.weight * (i.grade as number), 0) / total : 0
      out.push(virtualItem(`${block.root.id}:group`, block.root.name, block.root.weight, Math.max(average, block.root.recovery)))
    } else {
      out.push(...entries)
    }
  }
  for (const item of subject.evaluation) {
    if (!item.groupId || !placed.has(item.groupId)) out.push(item)
  }
  return out
}

/** Cuánto vale una parte sobre la nota final (en las mismas unidades que `weight`). */
export function itemWeight(subject: Evaluable, item: EvalItem): number {
  for (const block of layout(subject)) {
    const leaf = block.leaves.find((l) => l.group.id === item.groupId)
    if (leaf) return leaf.sum > 0 ? (leaf.share * item.weight) / leaf.sum : item.weight
  }
  return item.weight
}

/** Media de lo evaluado de unas partes, cada una con su peso; null si ninguna tiene nota. */
function weightedMean(items: Array<{ grade: number | null; weight: number }>): number | null {
  const graded = items.filter((i) => i.grade !== null)
  const total = graded.reduce((s, i) => s + i.weight, 0)
  return graded.length && total > 0 ? graded.reduce((s, i) => s + i.weight * (i.grade as number), 0) / total : null
}

export interface SectionGrade {
  group: EvalGroup
  items: EvalItem[]
  /** Media de lo ya evaluado dentro del apartado, o null si aún no hay ninguna nota. */
  average: number | null
  complete: boolean
}

export interface GroupGrade {
  group: EvalGroup
  /** Los apartados del bloque, en su orden. Vacío si el bloque guarda sus partes directamente. */
  sections: SectionGrade[]
  /** Todas las partes del bloque, de todos sus apartados. */
  items: EvalItem[]
  /** Media de lo ya evaluado dentro del bloque, o null si aún no hay ninguna nota. */
  average: number | null
  /** Todos los sitios del bloque tienen partes y todas tienen nota. */
  complete: boolean
  /** Nota del bloque cuando está completo, con la recuperación si mejora la media. */
  score: number | null
  /** La recuperación ha mejorado la nota del bloque. */
  recovered: boolean
}

/** Resumen de cada bloque, en su orden. Vacío si la asignatura no usa bloques. */
export function groupGrades(subject: Evaluable): GroupGrade[] {
  return layout(subject).map((block) => {
    const weighted = block.leaves.flatMap((leaf) =>
      leaf.members.map((item) => ({
        item,
        grade: item.grade,
        weight: leaf.sum > 0 ? (leaf.share * item.weight) / leaf.sum : 0,
      })),
    )
    const items = weighted.map((w) => w.item)
    const average = weightedMean(weighted)
    const complete =
      block.leaves.every((l) => l.members.length > 0 && l.sum > 0) && items.every((i) => i.grade !== null)
    const recovery = block.root.recovery
    const recovered = complete && average !== null && recovery !== null && recovery > average
    const sections = block.sections.length
      ? block.leaves.map((leaf) => ({
          group: leaf.group,
          items: leaf.members,
          average: weightedMean(leaf.members),
          complete: leaf.members.length > 0 && leaf.members.every((i) => i.grade !== null),
        }))
      : []
    return {
      group: block.root,
      sections,
      items,
      average,
      complete,
      score: complete && average !== null ? (recovered ? (recovery as number) : average) : null,
      recovered,
    }
  })
}

export function computeGrades(subject: Evaluable): SubjectGrades {
  const items = effectiveItems(subject)
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0)
  if (!items.length || totalWeight <= 0) {
    return {
      hasData: false,
      totalWeight: 0,
      weightsOff: false,
      points: 0,
      average: null,
      maxPossible: 0,
      gradedPercent: 0,
      complete: false,
      final: null,
      belowMin: [],
    }
  }

  let points = 0
  let gradedShare = 0
  for (const item of items) {
    if (item.grade === null) continue
    const share = item.weight / totalWeight
    points += share * item.grade
    gradedShare += share
  }

  const complete = items.every((i) => i.grade !== null)
  return {
    hasData: true,
    totalWeight,
    weightsOff: Math.abs(totalWeight - 100) > 0.01,
    points,
    average: gradedShare > EPS ? points / gradedShare : null,
    maxPossible: points + (1 - gradedShare) * 10,
    gradedPercent: Math.min(100, gradedShare * 100),
    complete,
    final: complete ? points : null,
    belowMin: items.filter((i) => i.grade !== null && i.minGrade !== null && i.grade < i.minGrade),
  }
}

export type Need =
  | { kind: 'empty' }
  /** Alguna parte con nota no llega a su mínimo: no hay forma de que haga media. */
  | { kind: 'blocked'; items: EvalItem[] }
  /** Todo evaluado: ya hay nota final. */
  | { kind: 'done'; final: number; reaches: boolean }
  /** Aunque saques un 0 en lo que falta, llegas (salvo los mínimos de cada parte). */
  | { kind: 'secured'; perItem: PerItem[] }
  | { kind: 'impossible'; max: number }
  | { kind: 'needs'; grade: number; perItem: PerItem[] }

export interface PerItem {
  item: EvalItem
  grade: number
}

/**
 * Qué hay que sacar en lo que falta para llegar a `target`.
 *
 * Se busca la menor nota `g` tal que, sacando `g` en cada parte pendiente (o su
 * mínimo, si es mayor), la nota final alcance el objetivo. La función es
 * monótona en `g`, así que basta una búsqueda binaria.
 */
export function requiredFor(subject: Evaluable, target: number): Need {
  const g = computeGrades(subject)
  if (!g.hasData) return { kind: 'empty' }
  if (g.belowMin.length) return { kind: 'blocked', items: g.belowMin }
  if (g.final !== null) return { kind: 'done', final: g.final, reaches: g.final >= target - EPS }

  const pending = effectiveItems(subject).filter((i) => i.grade === null)
  const total = g.totalWeight
  const pointsAt = (x: number) =>
    g.points + pending.reduce((sum, i) => sum + (i.weight / total) * Math.max(x, i.minGrade ?? 0), 0)
  const perItemAt = (x: number): PerItem[] =>
    pending.map((item) => ({ item, grade: Math.max(x, item.minGrade ?? 0) }))

  if (pointsAt(10) < target - EPS) return { kind: 'impossible', max: pointsAt(10) }
  if (pointsAt(0) >= target - EPS) return { kind: 'secured', perItem: perItemAt(0) }

  let lo = 0
  let hi = 10
  for (let n = 0; n < 50; n++) {
    const mid = (lo + hi) / 2
    if (pointsAt(mid) >= target - EPS) hi = mid
    else lo = mid
  }
  const grade = Math.min(10, ceil2(hi))
  return { kind: 'needs', grade, perItem: perItemAt(grade) }
}

/**
 * Nota media del expediente: media ponderada por créditos de las asignaturas
 * con evaluación completa y aprobadas. Devuelve null si no hay ninguna.
 */
export function weightedAverage(subjects: Subject[]): { value: number; count: number } | null {
  const rows = subjects
    .map((s) => ({ s, final: computeGrades(s).final }))
    .filter((r): r is { s: Subject; final: number } => r.final !== null && r.final >= PASS_GRADE)
  if (!rows.length) return null
  // Sin créditos informados no se puede ponderar: cada asignatura pesa lo mismo.
  const withCredits = rows.some((r) => r.s.credits > 0)
  let sum = 0
  let weight = 0
  for (const { s, final } of rows) {
    const w = withCredits ? s.credits : 1
    sum += final * w
    weight += w
  }
  return weight > 0 ? { value: sum / weight, count: rows.length } : null
}
