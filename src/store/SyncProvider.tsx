import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState } from '@/types'
import { SYNC_TABLE, deviceId, supabase, syncConfigured } from '@/lib/supabase'
import { sanitizeState } from '@/lib/storage'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/Confirm'
import { useT } from '@/i18n/I18nProvider'
import { useApp } from './AppStore'

export type SyncStatus = 'disabled' | 'signedOut' | 'syncing' | 'synced' | 'error' | 'offline'

export interface AuthResult {
  ok: boolean
  /** Already translated, ready to show. */
  error?: string
  needsEmailConfirmation?: boolean
}

interface SyncValue {
  available: boolean
  email: string | null
  userId: string | null
  status: SyncStatus
  lastSyncedAt: Date | null
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncValue | null>(null)

/** A workspace nobody has touched yet can be replaced without asking. */
function isPristine(state: AppState): boolean {
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

/** Everything except `settings`, which stays device-local by design. */
function syncable(state: AppState) {
  const { settings: _settings, ...rest } = state
  return rest
}

function fingerprint(state: AppState): string {
  return JSON.stringify(syncable(state))
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, replaceState } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()

  const available = syncConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(available ? 'signedOut' : 'disabled')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Serialisation of whatever we last wrote to (or read from) the cloud, so an
  // incoming pull does not immediately bounce back out as a push.
  const settled = useRef<string | null>(null)
  const reconciling = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  /* ------------------------------- session ------------------------------- */

  useEffect(() => {
    const client = supabase()
    if (!client) return
    let alive = true

    client.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session)
    })

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) {
        settled.current = null
        setStatus('signedOut')
        setLastSyncedAt(null)
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /* -------------------------------- push --------------------------------- */

  const push = useCallback(
    async (next: AppState) => {
      const client = supabase()
      if (!client || !session) return
      if (!navigator.onLine) {
        setStatus('offline')
        return
      }
      setStatus('syncing')
      const { error } = await client.from(SYNC_TABLE).upsert(
        {
          user_id: session.user.id,
          state: syncable(next),
          device_id: deviceId(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) {
        console.warn('DayFlow could not push to the cloud.', error)
        setStatus('error')
        return
      }
      settled.current = fingerprint(next)
      setLastSyncedAt(new Date())
      setStatus('synced')
    },
    [session],
  )

  /* ----------------------------- reconciliation --------------------------- */

  const reconcile = useCallback(async () => {
    const client = supabase()
    if (!client || !session) return
    reconciling.current = true
    setStatus('syncing')

    const { data, error } = await client
      .from(SYNC_TABLE)
      .select('state, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      console.warn('DayFlow could not read the cloud copy.', error)
      setStatus('error')
      reconciling.current = false
      return
    }

    const local = stateRef.current

    // Nothing stored yet: this device becomes the source of truth.
    if (!data) {
      await push(local)
      reconciling.current = false
      return
    }

    const remote = sanitizeState(data.state)
    if (!remote) {
      await push(local)
      reconciling.current = false
      return
    }

    // Settings are device-local, so always keep the ones already on this device.
    const merged: AppState = { ...remote, settings: local.settings, onboardingComplete: true }

    if (fingerprint(merged) === fingerprint(local)) {
      settled.current = fingerprint(local)
      setLastSyncedAt(new Date(data.updated_at))
      setStatus('synced')
      reconciling.current = false
      return
    }

    // A brand new workspace has nothing worth protecting; adopt the cloud copy.
    const adopt =
      isPristine(local) ||
      (await confirm({
        title: t('sync.pullTitle'),
        message: t('sync.pullBody'),
        confirmLabel: t('sync.useCloud'),
        cancelLabel: t('sync.keepLocal'),
        // Cerrar el diálogo sin elegir no puede equivaler a «mantener este dispositivo»,
        // que sobrescribe la nube.
        requireChoice: true,
      }))

    if (adopt) {
      settled.current = fingerprint(merged)
      replaceState(merged)
      setLastSyncedAt(new Date(data.updated_at))
      setStatus('synced')
      toast(t('sync.usedCloud'))
    } else {
      await push(local)
      toast(t('sync.pushed'))
    }
    reconciling.current = false
  }, [session, push, replaceState, confirm, t, toast])

  // Reconcile once per sign-in.
  const reconciledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!session) {
      reconciledFor.current = null
      return
    }
    if (reconciledFor.current === session.user.id) return
    reconciledFor.current = session.user.id
    void reconcile()
  }, [session, reconcile])

  /* --------------------------- push on change ----------------------------- */

  useEffect(() => {
    if (!session || reconciling.current) return
    const current = fingerprint(state)
    if (settled.current === null || settled.current === current) return
    const handle = window.setTimeout(() => void push(state), 1200)
    return () => window.clearTimeout(handle)
  }, [state, session, push])

  /* ------------------------------ connectivity ---------------------------- */

  useEffect(() => {
    const onOnline = () => {
      if (session) void push(stateRef.current)
    }
    const onOffline = () => {
      if (session) setStatus('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [session, push])

  /* -------------------------------- actions ------------------------------- */

  const describeError = useCallback(
    (message: string): string => {
      const m = message.toLowerCase()
      if (m.includes('invalid login') || m.includes('invalid credentials')) {
        return t('auth.errCredentials')
      }
      if (m.includes('already registered') || m.includes('already been registered')) {
        return t('auth.errExists')
      }
      if (m.includes('fetch') || m.includes('network')) return t('auth.errOffline')
      if (m.includes('password')) return t('auth.errPassword')
      return t('auth.errGeneric')
    },
    [t],
  )

  const signIn = useCallback<SyncValue['signIn']>(
    async (email, password) => {
      const client = supabase()
      if (!client) return { ok: false, error: t('auth.errOffline') }
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) return { ok: false, error: describeError(error.message) }
      toast(t('auth.signedIn'))
      return { ok: true }
    },
    [describeError, t, toast],
  )

  const signUp = useCallback<SyncValue['signUp']>(
    async (email, password) => {
      const client = supabase()
      if (!client) return { ok: false, error: t('auth.errOffline') }
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) return { ok: false, error: describeError(error.message) }
      // With email confirmation on, there is no session until the link is used.
      if (!data.session) {
        toast(t('auth.checkEmail'), { tone: 'info' })
        return { ok: true, needsEmailConfirmation: true }
      }
      toast(t('auth.accountCreated'))
      return { ok: true }
    },
    [describeError, t, toast],
  )

  const signOut = useCallback(async () => {
    const client = supabase()
    if (!client) return
    await client.auth.signOut()
    toast(t('auth.signedOut'), { tone: 'info' })
  }, [t, toast])

  const syncNow = useCallback(async () => {
    await push(stateRef.current)
  }, [push])

  const value = useMemo<SyncValue>(
    () => ({
      available,
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
      status,
      lastSyncedAt,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [available, session, status, lastSyncedAt, signIn, signUp, signOut, syncNow],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}
