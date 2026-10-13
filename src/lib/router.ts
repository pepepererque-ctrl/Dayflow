import { useCallback, useEffect, useState } from 'react'

export type RouteName =
  | 'today'
  | 'tasks'
  | 'subjects'
  | 'habits'
  | 'goals'
  | 'planner'
  | 'exams'
  | 'timetable'
  | 'focus'
  | 'analytics'
  | 'settings'

export const ROUTE_NAMES: RouteName[] = [
  'today',
  'tasks',
  'subjects',
  'habits',
  'goals',
  'planner',
  'exams',
  'timetable',
  'focus',
  'analytics',
  'settings',
]

export interface Route {
  name: RouteName
  /** Second path segment, used for subject, habit and goal detail screens. */
  param: string | null
  /** Parsed `?key=value` pairs, e.g. `#/focus?task=task_1`. */
  query: Record<string, string>
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [pathPart, queryPart = ''] = clean.split('?')
  const [head, param] = pathPart.split('/')
  const name = (ROUTE_NAMES as string[]).includes(head) ? (head as RouteName) : 'today'

  const query: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(queryPart)) query[key] = value

  return { name, param: param ? decodeURIComponent(param) : null, query }
}

/**
 * Hash routing keeps the app a single static bundle that works from the file
 * system or any host without server rewrites.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`
  if (window.location.hash === next) return
  window.location.hash = next
}

/** Scrolls the main region to the top whenever the route changes. */
export function useScrollReset(key: string) {
  useEffect(() => {
    const main = document.getElementById('dayflow-main')
    main?.scrollTo({ top: 0 })
  }, [key])
}

export function useNavigate() {
  return useCallback((path: string) => navigate(path), [])
}
