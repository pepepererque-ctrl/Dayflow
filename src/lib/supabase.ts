import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cloud sync configuration.
 *
 * The publishable key is designed to ship in client code — every table is
 * protected by row-level security, so it can only ever read or write the rows
 * belonging to the signed-in account. Keeping it here (rather than in a `.env`)
 * means `npm install && npm run dev` still works with zero setup, which is the
 * point of this project. Both values can still be overridden at build time.
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://xigajrsywphgwmyerrtt.supabase.co'

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_oR3dj4ToeYYI3H7yZ44Udw_zE9APc4D'

/** The single row-per-user table holding each workspace as one JSON document. */
export const SYNC_TABLE = 'dayflow_states'

let client: SupabaseClient | null = null

/**
 * Lazily created so the app boots (and works fully offline) even when the
 * config is blank — sync simply stays unavailable in that case.
 */
export function supabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'dayflow.auth',
      },
    })
  }
  return client
}

export function syncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
}

/** Stable per-browser id, so a device can tell its own writes from another's. */
export function deviceId(): string {
  const KEY = 'dayflow.device'
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const next = crypto.randomUUID()
    localStorage.setItem(KEY, next)
    return next
  } catch {
    return 'unknown-device'
  }
}
