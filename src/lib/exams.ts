import type { AppState, EvalItem, ISODate, Profile, Subject, TimeBlock } from '@/types'
import { addDays, dayOfWeek, diffDays, minutesFromClock } from './date'
import { isOpenSubject } from './subjects'
import { classesOn } from './timetable'

export interface ExamEntry {
  subject: Subject
  item: EvalItem
  date: ISODate
  /** Días que faltan (0 = hoy, negativo = ya pasó). */
  days: number
}

/**
 * Exámenes de las asignaturas, separados en próximos y pasados. Una asignatura
 * ya cerrada no genera cuenta atrás: solo conserva su historial.
 */
export function listExams(
  subjects: Subject[],
  today: ISODate,
): { upcoming: ExamEntry[]; past: ExamEntry[] } {
  const all: ExamEntry[] = []
  for (const subject of subjects) {
    for (const item of subject.evaluation) {
      if (!item.exam || !item.date) continue
      all.push({ subject, item, date: item.date, days: diffDays(item.date, today) })
    }
  }
  const byWhen = (a: ExamEntry, b: ExamEntry) =>
    a.date.localeCompare(b.date) || (a.item.time ?? '99:99').localeCompare(b.item.time ?? '99:99')

  return {
    upcoming: all.filter((e) => e.days >= 0 && isOpenSubject(e.subject)).sort(byWhen),
    past: all.filter((e) => e.days < 0).sort((a, b) => byWhen(b, a)),
  }
}

export interface PlanSummary {
  blocks: number
  minutes: number
  doneBlocks: number
}

/** Lo que un plan de estudio ya tiene en la agenda para un examen. */
export function planSummary(blocks: TimeBlock[], examId: string): PlanSummary {
  let count = 0
  let minutes = 0
  let done = 0
  for (const b of blocks) {
    if (b.examId !== examId) continue
    count++
    minutes += minutesFromClock(b.end) - minutesFromClock(b.start)
    if (b.done) done++
  }
  return { blocks: count, minutes, doneBlocks: done }
}

/**
 * Punto de partida para las horas de estudio: más créditos y más peso del
 * examen piden más tiempo. Es solo una sugerencia; el usuario la ajusta.
 */
export function defaultStudyMinutes(subject: Subject, item: EvalItem): number {
  const hours = Math.min(30, Math.max(3, Math.round(2 + subject.credits * 0.9 + item.weight / 10)))
  return hours * 60
}

/* ------------------------------ plan de estudio ---------------------------- */

export interface PlanParams {
  /** Minutos de estudio en total. */
  totalMinutes: number
  /** Duración deseada de cada sesión. */
  sessionMinutes: number
  includeWeekends: boolean
}

export interface PlanProposal {
  date: ISODate
  /** Minutos desde medianoche. */
  start: number
  end: number
}

export interface PlanResult {
  proposals: PlanProposal[]
  placedMinutes: number
  /** Minutos que no se han podido colocar por falta de huecos. */
  shortfallMinutes: number
  /** Días entre hoy y la víspera del examen (0 si el examen es hoy o ya pasó). */
  windowDays: number
}

type Interval = [number, number]

const MIN_SESSION = 30
const MAX_SESSION = 240
/** Aire entre una sesión y lo que viene después, para que no queden pegadas. */
const GAP_AFTER = 30

const roundUp15 = (m: number) => Math.ceil(m / 15) * 15
const round15 = (m: number) => Math.round(m / 15) * 15

/** Franjas donde se prefiere estudiar según el patrón de energía, y una más amplia de reserva. */
function studyWindows(profile: Pick<Profile, 'workStart' | 'workEnd' | 'energyPattern'>): Interval[] {
  const ws = minutesFromClock(profile.workStart)
  const we = minutesFromClock(profile.workEnd)
  const clamp = ([a, b]: Interval): Interval => [Math.max(7 * 60, a), Math.min(23 * 60, b)]
  const valid = ([a, b]: Interval) => b - a >= MIN_SESSION

  let preferred: Interval
  switch (profile.energyPattern) {
    case 'morning':
      preferred = [ws, Math.min(we, 14 * 60)]
      break
    case 'afternoon':
      preferred = [Math.max(ws, 14 * 60), we]
      break
    case 'evening':
      preferred = [Math.max(ws, 17 * 60), Math.max(we, 21 * 60)]
      break
    default:
      preferred = [ws, we]
  }
  const broad = clamp([Math.min(ws, 9 * 60), Math.max(we, 21 * 60)])
  const first = clamp(preferred)
  return valid(first) ? [first, broad] : [broad]
}

/**
 * Reparte el estudio entre hoy y la víspera del examen, en los huecos libres de
 * la agenda. Las sesiones se espacian por igual, con la última el día antes
 * para el repaso final; si hay más sesiones que días, las últimas jornadas
 * cargan con más. Si un día no tiene hueco se prueba con el más cercano.
 */
export function planStudy(
  state: Pick<AppState, 'blocks' | 'profile'> & Partial<Pick<AppState, 'subjects' | 'timetable'>>,
  exam: Pick<ExamEntry, 'item' | 'date'>,
  params: PlanParams,
  today: ISODate,
  nowMinutes: number,
): PlanResult {
  const lastDay = addDays(exam.date, -1)
  const windowDays = Math.max(0, diffDays(lastDay, today) + 1)

  const empty: PlanResult = { proposals: [], placedMinutes: 0, shortfallMinutes: params.totalMinutes, windowDays }
  if (windowDays === 0 || params.totalMinutes <= 0) return empty

  // Días disponibles. Si el filtro de fines de semana los vacía, mejor usarlos que no planificar.
  const every: ISODate[] = Array.from({ length: windowDays }, (_, i) => addDays(today, i))
  const weekdays = every.filter((d) => ![0, 6].includes(dayOfWeek(d)))
  const days = params.includeWeekends || !weekdays.length ? every : weekdays

  // El plan anterior de este mismo examen se va a sustituir: no debe ocupar sitio.
  const busy = new Map<ISODate, Interval[]>()
  const occupy = (date: ISODate, a: number, b: number) => {
    const list = busy.get(date) ?? []
    list.push([a, b])
    busy.set(date, list)
  }
  for (const b of state.blocks) {
    if (b.examId === exam.item.id && !b.done && b.date >= today) continue
    occupy(b.date, minutesFromClock(b.start), minutesFromClock(b.end))
  }

  // Las clases fijas del horario también ocupan sitio: no se estudia en plena clase.
  if (state.timetable && state.subjects) {
    const schedule = { subjects: state.subjects, timetable: state.timetable }
    for (const day of every) {
      for (const c of classesOn(schedule, day)) occupy(day, c.start, c.end)
    }
  }

  const windows = studyWindows(state.profile)
  const fits = (date: ISODate, a: number, b: number) =>
    !(busy.get(date) ?? []).some(([s, e]) => a < e && b > s)

  const place = (date: ISODate, len: number): number | null => {
    for (const [from, to] of windows) {
      const earliest = date === today ? Math.max(from, nowMinutes + 15) : from
      for (let start = roundUp15(earliest); start + len <= to; start += 15) {
        if (fits(date, start, start + len)) return start
      }
    }
    return null
  }

  const count = Math.max(1, Math.ceil(params.totalMinutes / params.sessionMinutes))
  const len = Math.min(MAX_SESSION, Math.max(MIN_SESSION, round15(params.totalMinutes / count)))

  // Qué día quiere cada sesión, antes de comprobar si hay hueco.
  const wanted: ISODate[] = []
  if (count <= days.length) {
    for (let i = 0; i < count; i++) {
      const at = count === 1 ? Math.floor((days.length - 1) / 2) : Math.round((i * (days.length - 1)) / (count - 1))
      wanted.push(days[at])
    }
  } else {
    const base = Math.floor(count / days.length)
    const extra = count % days.length
    days.forEach((d, i) => {
      const n = base + (i >= days.length - extra ? 1 : 0)
      for (let k = 0; k < n; k++) wanted.push(d)
    })
  }

  const proposals: PlanProposal[] = []
  let shortfall = 0
  for (const wantedDay of wanted) {
    // Primero el día pedido; si no cabe, los demás por cercanía.
    const order = [...days].sort(
      (a, b) => Math.abs(diffDays(a, wantedDay)) - Math.abs(diffDays(b, wantedDay)) || a.localeCompare(b),
    )
    let placed = false
    for (const day of order) {
      const start = place(day, len)
      if (start === null) continue
      proposals.push({ date: day, start, end: start + len })
      occupy(day, start, start + len + GAP_AFTER)
      placed = true
      break
    }
    if (!placed) shortfall += len
  }

  proposals.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
  return {
    proposals,
    placedMinutes: proposals.reduce((sum, p) => sum + (p.end - p.start), 0),
    shortfallMinutes: shortfall,
    windowDays,
  }
}
