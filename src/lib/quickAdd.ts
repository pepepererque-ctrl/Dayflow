import type { Clock, ISODate, Priority, Subject } from '@/types'
import { addDays, dayOfWeek, isValidISODate } from './date'

/**
 * Convierte una frase escrita deprisa en una tarea:
 *
 *   «entrega SI viernes a las 23:59 !alta ~2h»
 *     → «Entrega», asignatura SI, viernes, 23:59, prioridad alta, 2 h
 *
 * Reconoce fechas (hoy, mañana, el viernes, 15/10, 15 de octubre, en 3 días…),
 * horas (23:59, a las 10, 5pm), prioridad (!alta), asignatura (@fisica o las
 * siglas en mayúsculas) y duración (~90m, ~1h30). Lo que no reconoce se queda
 * en el título tal cual: ante la duda, no se inventa nada.
 */

export interface ParsedTask {
  title: string
  dueDate: ISODate | null
  dueTime: Clock | null
  priority: Priority | null
  subjectId: string | null
  estimateMin: number | null
  /** Cuántas piezas se han entendido; 0 significa que es texto plano. */
  recognized: number
}

export interface ParseContext {
  today: ISODate
  subjects: Pick<Subject, 'id' | 'name' | 'code'>[]
}

/* ------------------------------ utilidades -------------------------------- */

/**
 * Minúsculas y sin acentos, **conservando la longitud**: cada carácter se
 * sustituye por una sola letra, así los índices de la versión plegada sirven
 * para recortar el texto original.
 */
export function fold(text: string): string {
  return text
    .split('')
    .map((c) => {
      const base = c.normalize('NFD')[0] ?? c
      return base.toLowerCase()[0] ?? base
    })
    .join('')
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Fin de palabra: espacio, final o puntuación. */
const END = '(?=\\s|$|[.,;:!?])'

/**
 * Busca `re` sobre el texto plegado y, si encaja y `accept` lo valida, devuelve
 * el resultado junto con el texto original sin ese fragmento.
 */
function take<T>(
  work: string,
  re: RegExp,
  accept: (m: RegExpExecArray) => T | null,
): { value: T; rest: string } | null {
  const folded = fold(work)
  const flags = re.flags.replace('g', '')
  const scan = new RegExp(re.source, flags + 'g')
  let m: RegExpExecArray | null
  while ((m = scan.exec(folded))) {
    const value = accept(m)
    if (value !== null) {
      return { value, rest: `${work.slice(0, m.index)} ${work.slice(m.index + m[0].length)}` }
    }
    if (m[0] === '') scan.lastIndex++
  }
  return null
}

/* -------------------------------- fechas ---------------------------------- */

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
}

/** «para el», «el», «hasta»… delante de una fecha, que no es parte del título. */
const LEAD = '(?:(?:para el|para|hasta el|hasta|antes del|antes de|el|este|esta)\\s+)?'
const START = '(?:^|\\s)'

const monthAlternatives = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')

function buildDate(day: number, month: number, year: number | null, today: ISODate): ISODate | null {
  const yearNow = Number(today.slice(0, 4))
  const make = (y: number) => {
    const iso = `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return isValidISODate(iso) ? iso : null
  }
  if (year !== null) return make(year)
  const thisYear = make(yearNow)
  if (thisYear && thisYear >= today) return thisYear
  // Sin año y ya pasada: se entiende que es la del año que viene.
  return make(yearNow + 1)
}

/** El próximo `weekday` estrictamente después de hoy. */
function nextWeekday(today: ISODate, weekday: number): ISODate {
  const delta = (weekday - dayOfWeek(today) + 7) % 7 || 7
  return addDays(today, delta)
}

function takeDate(work: string, today: ISODate): { value: ISODate; rest: string } | null {
  // El orden importa: «pasado mañana» antes que «mañana».
  const relative: Array<[RegExp, number]> = [
    [new RegExp(`${START}${LEAD}pasado manana${END}`), 2],
    [new RegExp(`${START}${LEAD}manana${END}`), 1],
    [new RegExp(`${START}${LEAD}hoy${END}`), 0],
  ]
  for (const [re, offset] of relative) {
    const hit = take(work, re, () => addDays(today, offset))
    if (hit) return hit
  }

  const inN = take(
    work,
    new RegExp(`${START}(?:en|dentro de)\\s+(\\d{1,3}|un|una)\\s+(dias?|semanas?)${END}`),
    (m) => {
      const n = m[1] === 'un' || m[1] === 'una' ? 1 : Number(m[1])
      return addDays(today, m[2].startsWith('semana') ? n * 7 : n)
    },
  )
  if (inN) return inN

  const dayName = take(
    work,
    new RegExp(
      `${START}${LEAD}(?:(?:proximo|siguiente)\\s+)?(${Object.keys(WEEKDAYS).join('|')})(?:\\s+(?:que viene|proximo|siguiente))?${END}`,
    ),
    (m) => nextWeekday(today, WEEKDAYS[m[1]]),
  )
  if (dayName) return dayName

  const dayMonth = take(
    work,
    new RegExp(`${START}${LEAD}(\\d{1,2})\\s*(?:de\\s+)?(${monthAlternatives})(?:\\s+(?:de\\s+)?(\\d{4}))?${END}`),
    (m) => buildDate(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, today),
  )
  if (dayMonth) return dayMonth

  // dd/mm y dd/mm/aaaa. Con guion solo se acepta con año completo: «3-4» es
  // casi siempre «ejercicios 3 a 4», no el 3 de abril.
  const slash = take(
    work,
    new RegExp(`${START}${LEAD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${END}`),
    (m) => {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null
      return buildDate(Number(m[1]), Number(m[2]), year, today)
    },
  )
  if (slash) return slash

  return take(
    work,
    new RegExp(`${START}${LEAD}(\\d{1,2})-(\\d{1,2})-(\\d{4})${END}`),
    (m) => buildDate(Number(m[1]), Number(m[2]), Number(m[3]), today),
  )
}

/* --------------------------------- horas ---------------------------------- */

const clock = (h: number, m: number): Clock | null =>
  h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null

function takeTime(work: string): { value: Clock; rest: string } | null {
  // «a las 5 de la tarde», «a las 10:30», «a las 9h»
  const spoken = take(
    work,
    new RegExp(
      `${START}a las?\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(?:h|horas?)?(?:\\s+de la\\s+(manana|tarde|noche))?${END}`,
    ),
    (m) => {
      let h = Number(m[1])
      if ((m[3] === 'tarde' || m[3] === 'noche') && h < 12) h += 12
      return clock(h, m[2] ? Number(m[2]) : 0)
    },
  )
  if (spoken) return spoken

  const hhmm = take(work, new RegExp(`${START}(\\d{1,2}):(\\d{2})\\s*(?:h)?${END}`), (m) =>
    clock(Number(m[1]), Number(m[2])),
  )
  if (hhmm) return hhmm

  return take(work, new RegExp(`${START}(\\d{1,2})\\s?(am|pm)${END}`), (m) => {
    const h = Number(m[1])
    if (h < 1 || h > 12) return null
    return clock(m[2] === 'pm' ? (h % 12) + 12 : h % 12, 0)
  })
}

/* ----------------------- prioridad, duración, asignatura ------------------- */

const PRIORITY_WORDS: Record<string, Priority> = {
  urgente: 'urgent',
  alta: 'high',
  media: 'medium',
  normal: 'medium',
  baja: 'low',
}

function takeEstimate(work: string): { value: number; rest: string } | null {
  // ~1h30, ~2h, ~1,5h
  const hours = take(
    work,
    new RegExp(`${START}~\\s*(\\d{1,2})(?:[.,](\\d))?\\s*h(?:\\s*(\\d{1,2}))?${END}`),
    (m) => {
      const base = Number(m[1]) * 60
      const extra = m[2] ? Math.round(Number(`0.${m[2]}`) * 60) : m[3] ? Number(m[3]) : 0
      const total = base + extra
      return total >= 5 && total <= 1440 ? total : null
    },
  )
  if (hours) return hours
  return take(work, new RegExp(`${START}~\\s*(\\d{1,4})\\s*(?:min|m)${END}`), (m) => {
    const total = Number(m[1])
    return total >= 5 && total <= 1440 ? total : null
  })
}

/** «@fisica» → la asignatura cuyas siglas o cuyo nombre (o una palabra de él) empiece así. */
function resolveHandle(handle: string, subjects: ParseContext['subjects']): string | null {
  const byCode = subjects.filter((s) => s.code && fold(s.code) === handle)
  if (byCode.length === 1) return byCode[0].id
  const byName = subjects.filter((s) =>
    fold(s.name)
      .split(/\s+/)
      .some((word) => word.startsWith(handle)),
  )
  // Si hay varias que encajan, no se elige por el usuario.
  return byName.length === 1 ? byName[0].id : null
}

function takeSubject(work: string, subjects: ParseContext['subjects']): { value: string; rest: string } | null {
  const handle = take(work, new RegExp(`${START}@([a-z0-9._-]+)${END}`), (m) =>
    resolveHandle(m[1], subjects),
  )
  if (handle) return handle

  // Siglas sueltas («entrega SI viernes»): solo en mayúsculas y de 2+ letras,
  // para que un «si» cualquiera dentro de una frase no se confunda con la asignatura.
  const codes = subjects
    .filter((s) => s.code.length >= 2 && s.code === s.code.toUpperCase())
    .sort((a, b) => b.code.length - a.code.length)
  for (const s of codes) {
    const re = new RegExp(`(?:^|\\s)${escapeRe(s.code)}(?=\\s|$|[.,;:!?])`)
    const m = re.exec(work)
    if (m) {
      return { value: s.id, rest: `${work.slice(0, m.index)} ${work.slice(m.index + m[0].length)}` }
    }
  }
  return null
}

/* --------------------------------- título --------------------------------- */

const CONNECTORS = new Set(['de', 'del', 'para', 'el', 'la', 'los', 'las', 'en', 'a', 'al', 'antes', 'hasta', 'por', 'que', 'y'])

function cleanTitle(text: string, trimConnectors: boolean): string {
  let words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const edge = /^[,.;:\-–—]+|[,.;:\-–—]+$/g
  if (trimConnectors) {
    // Lo que queda cojo tras quitar la fecha: «entrega de» → «entrega».
    while (words.length > 1 && CONNECTORS.has(fold(words[words.length - 1]).replace(edge, ''))) words.pop()
    while (words.length > 1 && CONNECTORS.has(fold(words[0]).replace(edge, ''))) words.shift()
  }
  const title = words.join(' ').replace(edge, '').trim()
  return title ? title[0].toUpperCase() + title.slice(1) : ''
}

/* ---------------------------------- API ----------------------------------- */

export function parseQuickAdd(input: string, ctx: ParseContext): ParsedTask {
  let work = input.trim()
  const out: ParsedTask = {
    title: '',
    dueDate: null,
    dueTime: null,
    priority: null,
    subjectId: null,
    estimateMin: null,
    recognized: 0,
  }

  const estimate = takeEstimate(work)
  if (estimate) {
    out.estimateMin = estimate.value
    work = estimate.rest
    out.recognized++
  }

  const priority = take(
    work,
    new RegExp(`${START}!(urgente|alta|media|normal|baja)${END}`),
    (m) => PRIORITY_WORDS[m[1]],
  )
  if (priority) {
    out.priority = priority.value
    work = priority.rest
    out.recognized++
  }

  const subject = takeSubject(work, ctx.subjects)
  if (subject) {
    out.subjectId = subject.value
    work = subject.rest
    out.recognized++
  }

  const time = takeTime(work)
  if (time) {
    out.dueTime = time.value
    work = time.rest
    out.recognized++
  }

  const date = takeDate(work, ctx.today)
  if (date) {
    out.dueDate = date.value
    work = date.rest
    out.recognized++
  }

  // Una hora sin día se entiende como «hoy a esa hora».
  if (out.dueTime && !out.dueDate) out.dueDate = ctx.today

  out.title = cleanTitle(work, out.recognized > 0)
  return out
}
