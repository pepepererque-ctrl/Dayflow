/** Short, collision-safe id. `crypto.randomUUID` is available in every target browser. */
export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${raw.replace(/-/g, '').slice(0, 12)}` : raw
}
