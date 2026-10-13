import type { Clock, ISODate } from '@/types'
import { activeLocale } from './locale'

/**
 * All date maths here is deliberately local-timezone. `new Date('2026-08-24')`
 * parses as UTC and silently shifts the day for anyone west of Greenwich, so we
 * never hand a bare ISO date to the Date constructor.
 */

export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(): ISODate {
  return toISO(new Date())
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISO(a).getTime() - fromISO(b).getTime()
  return Math.round(ms / 86_400_000)
}

export function dayOfWeek(iso: ISODate): number {
  return fromISO(iso).getDay()
}

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1): ISODate {
  const dow = dayOfWeek(iso)
  const delta = (dow - weekStartsOn + 7) % 7
  return addDays(iso, -delta)
}

export function weekDates(anchor: ISODate, weekStartsOn: 0 | 1): ISODate[] {
  const start = startOfWeek(anchor, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Inclusive range ending at `end`, `count` days long. */
export function lastNDays(count: number, end: ISODate = todayISO()): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1))
}

/** 2024-01-07 was a Sunday, so it anchors weekday index 0. */
const WEEKDAY_ANCHOR = new Date(2024, 0, 7)

function weekdayName(dow: number, weekday: 'short' | 'narrow' | 'long'): string {
  const d = new Date(WEEKDAY_ANCHOR)
  d.setDate(d.getDate() + dow)
  return d.toLocaleDateString(activeLocale(), { weekday })
}

/** e.g. Mon / lun. */
export function weekdayShort(dow: number): string {
  return weekdayName(dow, 'short')
}

/** e.g. lunes. */
export function weekdayLong(dow: number): string {
  return weekdayName(dow, 'long')
}

/** Single letter for the habit grids. */
export function weekdayNarrow(dow: number): string {
  return weekdayName(dow, 'narrow')
}

export function formatFullDate(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(activeLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function formatShortDate(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(activeLocale(), { month: 'short', day: 'numeric' })
}

export function formatMonthYear(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(activeLocale(), { month: 'long', year: 'numeric' })
}

/**
 * Which label a date deserves. Returning a descriptor instead of text keeps
 * this module free of copy, so the caller translates it.
 */
export type RelativeDay =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'yesterday' }
  | { kind: 'weekday'; text: string }
  | { kind: 'date'; text: string }

export function relativeDay(iso: ISODate, from: ISODate = todayISO()): RelativeDay {
  const delta = diffDays(iso, from)
  if (delta === 0) return { kind: 'today' }
  if (delta === 1) return { kind: 'tomorrow' }
  if (delta === -1) return { kind: 'yesterday' }
  if (delta > 1 && delta <= 6) return { kind: 'weekday', text: weekdayShort(dayOfWeek(iso)) }
  return { kind: 'date', text: formatShortDate(iso) }
}

export function minutesFromClock(clock: Clock): number {
  const [h, m] = clock.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Clamps rather than wraps: a block pushed past midnight should end at 23:59,
 * never at 00:00, which would read as ending before it started.
 */
export function clockFromMinutes(total: number): Clock {
  const clamped = Math.max(0, Math.min(1439, Math.round(total)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Renders `HH:MM` using the viewer's locale (so 12h users see 9:30 AM). */
export function formatClock(clock: Clock): string {
  const [h, m] = clock.split(':').map(Number)
  const d = new Date(2000, 0, 1, h || 0, m || 0)
  return d.toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })
}

export function formatDuration(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes))
  // Spanish abbreviates minutes as "min"; English is happy with a bare "m".
  const unit = activeLocale().startsWith('es') ? ' min' : 'm'
  if (mins < 60) return `${mins}${unit}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}${unit}`
}

export function nowClock(): Clock {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Returns a translation key rather than copy. */
export function greetingKey(
  date = new Date(),
): 'greeting.night' | 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
  const h = date.getHours()
  if (h < 5) return 'greeting.night'
  if (h < 12) return 'greeting.morning'
  if (h < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = fromISO(value)
  return !Number.isNaN(d.getTime()) && toISO(d) === value
}

export function isValidClock(value: unknown): value is Clock {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** «octubre»: el mes en minúscula, como título de la agenda. */
export function monthName(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(activeLocale(), { month: 'long' })
}

/** «OCT»: el mes (0-11) abreviado, para los botones del selector de mes. */
export function monthShort(month: number): string {
  return new Date(2024, month, 1)
    .toLocaleDateString(activeLocale(), { month: 'short' })
    .replace('.', '')
    .toUpperCase()
}
