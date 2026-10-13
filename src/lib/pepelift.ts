import { supabase } from './supabase'

/**
 * Read-only bridge into PepeLift's tables. DayFlow and PepeLift share one
 * Supabase project and the same email/password accounts, so once a user signs
 * into DayFlow's cloud sync with that account, row-level security (scoped to
 * `user_id = auth.uid()` on every PepeLift table) already limits every query
 * here to that person's own workouts — nothing extra to configure.
 *
 * DayFlow never writes to these tables; logging a workout still happens in
 * PepeLift itself.
 *
 * Solo se leen entrenos **terminados**: uno sin `finished_at` está en curso (o
 * quedó abierto y abandonado) y no es historial, así que nunca se muestra.
 */

export interface PepeLiftWorkout {
  id: string
  name: string
  startedAt: string
  finishedAt: string
  sets: number
  volumeKg: number
}

interface WorkoutRow {
  id: string
  name: string
  started_at: string
  finished_at: string | null
}

interface SetRow {
  workout_id: string
  weight: number | string | null
  reps: number | null
  completed: boolean
}

/** Returns null on a fetch/permission failure, distinct from a genuine empty list. */
export async function fetchRecentWorkouts(
  userId: string,
  limit = 8,
): Promise<PepeLiftWorkout[] | null> {
  const client = supabase()
  if (!client) return null

  const { data: workouts, error: workoutsError } = await client
    .from('workouts')
    .select('id, name, started_at, finished_at')
    .eq('user_id', userId)
    // Filtrar aquí y no al pintar: si no, los entrenos abiertos ocupan sitio en el límite.
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(limit)

  if (workoutsError) {
    console.warn('DayFlow could not read PepeLift workouts.', workoutsError)
    return null
  }
  // Doble seguro por si la base devolviera uno sin terminar.
  const rows = ((workouts ?? []) as WorkoutRow[]).filter((w) => w.finished_at !== null)
  if (rows.length === 0) return []

  const ids = rows.map((w) => w.id)
  const { data: sets, error: setsError } = await client
    .from('workout_sets')
    .select('workout_id, weight, reps, completed')
    .in('workout_id', ids)

  if (setsError) {
    console.warn('DayFlow could not read PepeLift sets.', setsError)
    return null
  }

  const totals = new Map<string, { sets: number; volume: number }>()
  for (const s of (sets ?? []) as SetRow[]) {
    if (!s.completed) continue
    const agg = totals.get(s.workout_id) ?? { sets: 0, volume: 0 }
    agg.sets += 1
    agg.volume += Number(s.weight ?? 0) * Number(s.reps ?? 0)
    totals.set(s.workout_id, agg)
  }

  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    startedAt: w.started_at,
    finishedAt: w.finished_at as string,
    sets: totals.get(w.id)?.sets ?? 0,
    volumeKg: Math.round(totals.get(w.id)?.volume ?? 0),
  }))
}

export function isThisWeek(iso: string, weekStartsOn: 0 | 1, today: Date = new Date()): boolean {
  const d = new Date(iso)
  const start = new Date(today)
  const dow = start.getDay()
  const delta = (dow - weekStartsOn + 7) % 7
  start.setDate(start.getDate() - delta)
  start.setHours(0, 0, 0, 0)
  return d >= start
}

export function workoutDurationMin(w: PepeLiftWorkout): number | null {
  const ms = new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()
  return ms > 0 ? Math.round(ms / 60_000) : null
}
