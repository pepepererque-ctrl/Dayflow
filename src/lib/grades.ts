import type { EvalItem, Subject } from '@/types'

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

export function computeGrades(subject: Pick<Subject, 'evaluation'>): SubjectGrades {
  const items = subject.evaluation
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
export function requiredFor(subject: Pick<Subject, 'evaluation'>, target: number): Need {
  const g = computeGrades(subject)
  if (!g.hasData) return { kind: 'empty' }
  if (g.belowMin.length) return { kind: 'blocked', items: g.belowMin }
  if (g.final !== null) return { kind: 'done', final: g.final, reaches: g.final >= target - EPS }

  const pending = subject.evaluation.filter((i) => i.grade === null)
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
