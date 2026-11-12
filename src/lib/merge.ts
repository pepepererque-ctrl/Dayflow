import type { AppState } from '@/types'

/**
 * Combinación de tres versiones (la última que coincidía con la nube, la de este
 * dispositivo y la de la nube) para que dos dispositivos puedan editar sin pisarse.
 *
 * Reglas, aplicadas en cada nivel:
 *  - si solo cambió uno de los dos lados, se queda su cambio (también altas y bajas);
 *  - las listas de elementos con `id` se combinan elemento a elemento: lo que añade
 *    cada lado se conserva, y lo que un lado borra se borra si el otro no lo tocó;
 *  - si ambos tocaron el mismo elemento, se combina campo a campo y, si ambos
 *    cambiaron el mismo campo, gana este dispositivo;
 *  - borrar en un lado y modificar en el otro conserva la modificación: perder datos
 *    es peor que resucitar algo borrado.
 */

type Json = unknown
type Plain = Record<string, Json>

const isPlain = (v: Json): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

const hasId = (v: Json): v is Plain & { id: string } => isPlain(v) && typeof v.id === 'string' && v.id !== ''

/** Lista de elementos con `id` único: se combina por `id`, no por posición. */
function isKeyed(v: Json): v is Array<Plain & { id: string }> {
  if (!Array.isArray(v) || !v.every(hasId)) return false
  return new Set(v.map((x) => x.id)).size === v.length
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  const ka = Object.keys(a as Plain)
  const kb = Object.keys(b as Plain)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in (b as Plain) && deepEqual((a as Plain)[k], (b as Plain)[k]))
}

function mergeKeyed(
  base: Array<Plain & { id: string }> | undefined,
  local: Array<Plain & { id: string }>,
  remote: Array<Plain & { id: string }>,
): Array<Plain & { id: string }> {
  const b = new Map((base ?? []).map((x) => [x.id, x]))
  const r = new Map(remote.map((x) => [x.id, x]))
  const l = new Map(local.map((x) => [x.id, x]))
  const out: Array<Plain & { id: string }> = []
  // El orden de este dispositivo manda; lo que solo está en la nube va al final, en su orden.
  const ids = [...local.map((x) => x.id), ...remote.filter((x) => !l.has(x.id)).map((x) => x.id)]
  for (const id of ids) {
    const merged = mergeValue(b.get(id), l.get(id), r.get(id))
    if (merged !== undefined) out.push(merged as Plain & { id: string })
  }
  return out
}

function mergeValue(base: Json, local: Json, remote: Json): Json {
  if (deepEqual(local, remote)) return local
  if (deepEqual(base, local)) return remote
  if (deepEqual(base, remote)) return local
  // Ambos lados cambiaron. Borrado frente a modificación: gana la modificación.
  if (local === undefined) return remote
  if (remote === undefined) return local

  if (isPlain(local) && isPlain(remote)) {
    const b = isPlain(base) ? base : {}
    const out: Plain = {}
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const merged = mergeValue(b[key], local[key], remote[key])
      if (merged !== undefined) out[key] = merged
    }
    return out
  }

  if (isKeyed(local) && isKeyed(remote)) {
    return mergeKeyed(isKeyed(base) ? base : undefined, local, remote)
  }

  if (isPrimitiveList(local) && isPrimitiveList(remote)) {
    return mergeSet(isPrimitiveList(base) ? base : [], local, remote)
  }

  // Valores sueltos o listas sin `id`: gana este dispositivo.
  return local
}

type Primitive = string | number | boolean

const isPrimitiveList = (v: Json): v is Primitive[] =>
  Array.isArray(v) && v.every((x) => ['string', 'number', 'boolean'].includes(typeof x))

/**
 * Listas de valores sueltos (los días de un hábito cumplido): se tratan como
 * conjuntos, así dos dispositivos que marcan días distintos suman en vez de pisarse.
 */
function mergeSet(base: Primitive[], local: Primitive[], remote: Primitive[]): Primitive[] {
  const inBase = new Set(base)
  const inLocal = new Set(local)
  const inRemote = new Set(remote)
  const out = [...local.filter((x) => !inBase.has(x) || inRemote.has(x))]
  for (const x of remote) {
    if (out.includes(x)) continue
    // Lo que esta lista tenía y este dispositivo quitó, no vuelve; lo nuevo de la nube entra.
    if (!inBase.has(x) || inLocal.has(x)) out.push(x)
  }
  // Se conserva el orden en que estaba la lista (los registros de hábitos van de más reciente a más antiguo).
  const dates = out.every((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
  const desc = dates || (local.length > 1 && local.every((x, i) => i === 0 || local[i - 1] >= x))
  const asc = local.length > 1 && local.every((x, i) => i === 0 || local[i - 1] <= x)
  if (desc) out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  else if (asc) out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return out
}

/** Un espacio al que nadie ha añadido nada: puede sustituirse por la copia de la nube sin perder nada. */
export function isPristine(state: AppState): boolean {
  return (
    state.tasks.length === 0 &&
    state.habits.length === 0 &&
    state.goals.length === 0 &&
    state.subjects.length === 0 &&
    state.timetable.slots.length === 0 &&
    state.blocks.length === 0 &&
    state.sessions.length === 0
  )
}

/** Lo que se sincroniza: todo menos los ajustes, que son de cada dispositivo. */
export type SyncState = Omit<AppState, 'settings'>

export function syncable(state: AppState): SyncState {
  const { settings: _settings, ...rest } = state
  return rest
}

/**
 * Combina el estado de este dispositivo con el de la nube. `base` es la última
 * versión que se sabía común a ambos; sin ella (primera vez) se unen las dos y,
 * donde chocan, gana este dispositivo.
 */
export function mergeStates(base: SyncState | null, local: AppState, remote: AppState): AppState {
  const merged = mergeValue(base ?? undefined, syncable(local), syncable(remote)) as SyncState
  return { ...merged, settings: local.settings }
}
