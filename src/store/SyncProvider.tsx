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
import { syncable, type SyncState } from '@/lib/merge'
import { disablePush } from '@/lib/push'
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

/** Cada cuánto se mira si otro dispositivo guardó algo, con la app a la vista. */
const POLL_MS = 30_000

/**
 * La última versión que se sabía común a este dispositivo y a la nube, y la «hora» de
 * guardado que tenía. Sirve de punto de partida para combinar cambios de los dos lados.
 */
interface Base {
  userId: string
  /** `updated_at` de la nube en ese momento; si cambia, otro dispositivo ha guardado. */
  token: string | null
  state: SyncState
}

const BASE_KEY = 'dayflow.sync.base.v1'

function readBase(): Base | null {
  try {
    const raw = JSON.parse(localStorage.getItem(BASE_KEY) ?? 'null') as Partial<Base> | null
    if (!raw || typeof raw.userId !== 'string' || typeof raw.state !== 'object' || raw.state === null) return null
    return { userId: raw.userId, token: typeof raw.token === 'string' ? raw.token : null, state: raw.state }
  } catch {
    return null
  }
}

function writeBase(base: Base): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base))
  } catch {
    /* sin almacenamiento se combina sin punto de partida: se unen ambas copias, sin perder nada */
  }
}

function fingerprint(state: AppState): string {
  return JSON.stringify(syncable(state))
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, replaceState } = useApp()
  const { toast } = useToast()
  const confirm = useConfirm()
  const t = useT()

  const available = syncConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(available ? 'signedOut' : 'disabled')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Lo último que sabemos que tiene la nube (serializado): si el estado local coincide, no hay nada que subir.
  const settled = useRef<string | null>(null)
  /** Punto de partida para combinar y «hora» de la nube que lo originó. */
  const base = useRef<Base | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  /** Sube cada vez que se integra algo de la nube, para reevaluar si queda algo por subir. */
  const [integrated, setIntegrated] = useState(0)
  /** Las operaciones con la nube van de una en una: así una subida nunca se cruza con una lectura. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job)
    queue.current = next.catch(() => undefined)
    return next
  }, [])

  const userId = session?.user.id ?? null

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
        base.current = null
        setStatus('signedOut')
        setLastSyncedAt(null)
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /* ------------------------------ nube → aquí ------------------------------ */

  /**
   * Mira si otro dispositivo ha guardado y, si es así, combina su copia con la de
   * este dispositivo.
   *  - 'merged': había novedades y se han combinado. El estado nuevo aún no está pintado,
   *    así que no se debe subir nada en este mismo momento: lo hace el efecto de subida.
   *  - 'same': la nube está como la dejamos; si este dispositivo tiene algo más, hay que subirlo.
   *  - 'failed': sin red o error del servidor.
   */
  const pull = useCallback(async (): Promise<'merged' | 'same' | 'failed'> => {
    const client = supabase()
    if (!client || !userId) return 'failed'
    if (!navigator.onLine) {
      setStatus('offline')
      return 'failed'
    }

    const head = await client.from(SYNC_TABLE).select('updated_at').eq('user_id', userId).maybeSingle()
    if (head.error) {
      console.warn('DayFlow could not read the cloud copy.', head.error)
      setStatus('error')
      return 'failed'
    }

    // Nada guardado todavía: la nube está vacía y este dispositivo será el primero en subir.
    if (!head.data) {
      base.current = { userId, token: null, state: syncable(stateRef.current) }
      settled.current = '__nothing__'
      return 'same'
    }

    const token = head.data.updated_at as string
    if (base.current && base.current.userId === userId && base.current.token === token) {
      // Sin novedades en la nube. Lo que la nube tiene es el punto de partida, no el estado local:
      // así lo que quedó sin subir de una sesión anterior se sube ahora.
      if (settled.current === null) settled.current = JSON.stringify(base.current.state)
      setLastSyncedAt(new Date())
      return 'same'
    }

    const full = await client.from(SYNC_TABLE).select('state, updated_at').eq('user_id', userId).maybeSingle()
    if (full.error || !full.data) {
      console.warn('DayFlow could not read the cloud copy.', full.error)
      setStatus('error')
      return 'failed'
    }
    const remote = sanitizeState(full.data.state)
    const remoteToken = full.data.updated_at as string
    if (!remote) {
      // La copia de la nube es ilegible: se deja que este dispositivo la sustituya.
      base.current = { userId, token: remoteToken, state: syncable(stateRef.current) }
      settled.current = '__unreadable__'
      return 'same'
    }

    const mine = readBase()
    if (mine && mine.userId !== userId) {
      // En este dispositivo hay datos de otra cuenta: combinarlos mezclaría las dos. Se pregunta.
      const local = stateRef.current
      const useCloud = await confirm({
        title: t('sync.pullTitle'),
        message: t('sync.pullBody'),
        confirmLabel: t('sync.useCloud'),
        cancelLabel: t('sync.keepLocal'),
        // Cerrar el diálogo sin elegir no puede equivaler a «mantener este dispositivo»,
        // que sobrescribe la nube.
        requireChoice: true,
      })
      base.current = { userId, token: remoteToken, state: syncable(remote) }
      writeBase(base.current)
      settled.current = fingerprint(remote)
      if (useCloud) {
        replaceState({ ...remote, settings: local.settings, onboardingComplete: true })
        toast(t('sync.usedCloud'))
      } else {
        toast(t('sync.pushed'))
      }
      setLastSyncedAt(new Date(remoteToken))
      setIntegrated((n) => n + 1)
      return 'merged'
    }

    // Caso normal: se combina dentro del reductor, con el estado más reciente de este dispositivo.
    const start = base.current && base.current.userId === userId ? base.current.state : (mine?.state ?? null)
    dispatch({ type: 'mergeRemote', base: start, remote })
    base.current = { userId, token: remoteToken, state: syncable(remote) }
    writeBase(base.current)
    // Lo que la nube tiene ahora; si este dispositivo tiene algo más, el efecto de subida lo detecta.
    settled.current = fingerprint(remote)
    setLastSyncedAt(new Date(remoteToken))
    // Obliga al efecto de subida a mirar de nuevo aunque el estado resultante sea el mismo objeto.
    setIntegrated((n) => n + 1)
    return 'merged'
  }, [userId, dispatch, replaceState, confirm, t, toast])

  /* ------------------------------ aquí → nube ------------------------------ */

  /**
   * Sube el estado actual. Solo escribe si la nube sigue como la dejamos nosotros la
   * última vez; si otro dispositivo guardó entremedias, no se pisa: se vuelve a
   * combinar y se reintenta.
   */
  const push = useCallback(async (force = false): Promise<boolean> => {
    const client = supabase()
    const current = base.current
    if (!client || !userId || !current || current.userId !== userId) return false
    if (!navigator.onLine) {
      setStatus('offline')
      return false
    }
    const next = stateRef.current
    const payload = {
      state: syncable(next),
      device_id: deviceId(),
      updated_at: new Date().toISOString(),
    }
    setStatus('syncing')

    let written: string | null = null
    if (force) {
      // Solo tras comprobar que la nube sigue como la dejamos (la comparación por hora falló sin motivo).
      const { data, error } = await client.from(SYNC_TABLE).update(payload).eq('user_id', userId).select('updated_at')
      if (error) {
        console.warn('DayFlow could not push to the cloud.', error)
        setStatus('error')
        return false
      }
      written = data?.[0]?.updated_at ?? null
    } else if (current.token === null) {
      const { data, error } = await client
        .from(SYNC_TABLE)
        .insert({ user_id: userId, ...payload })
        .select('updated_at')
        .maybeSingle()
      // 23505: otro dispositivo creó la fila antes; se combinará en la siguiente lectura.
      if (error && error.code !== '23505') {
        console.warn('DayFlow could not push to the cloud.', error)
        setStatus('error')
        return false
      }
      written = (data?.updated_at as string | undefined) ?? null
    } else {
      const { data, error } = await client
        .from(SYNC_TABLE)
        .update(payload)
        .eq('user_id', userId)
        .eq('updated_at', current.token)
        .select('updated_at')
      if (error) {
        console.warn('DayFlow could not push to the cloud.', error)
        setStatus('error')
        return false
      }
      written = data?.[0]?.updated_at ?? null
    }

    if (!written) {
      // La nube no coincide con lo que esperábamos: otro dispositivo guardó entremedias. No se pisa:
      // se trae y se combina, y la subida se reintenta cuando el estado combinado esté pintado.
      const expected = current.token
      base.current = { ...current, token: '__stale__' }
      const result = await pull()
      if (result === 'failed') return false
      if (base.current?.token === expected && !force) {
        // La nube sigue exactamente igual que antes y aun así no coincidió: no hay nadie con quien
        // chocar (y no se ha cambiado nada de este dispositivo al combinar), así que se sube sin condición.
        return push(true)
      }
      return false
    }

    base.current = { userId, token: written, state: payload.state }
    writeBase(base.current)
    settled.current = fingerprint(next)
    setLastSyncedAt(new Date())
    setStatus('synced')
    return true
  }, [userId, pull])

  /** Una vuelta completa: traer lo nuevo de la nube y subir lo de este dispositivo si hace falta. */
  const sync = useCallback(
    () =>
      enqueue(async () => {
        if (!userId) return false
        setStatus('syncing')
        const result = await pull()
        if (result === 'failed') return false
        // Tras combinar, el estado nuevo aún no está pintado: la subida la hace el efecto de abajo.
        if (result === 'merged') return true
        if (settled.current !== fingerprint(stateRef.current)) return push()
        setStatus('synced')
        return true
      }),
    [enqueue, userId, pull, push],
  )

  // Al iniciar sesión (o abrir la app con la sesión ya iniciada).
  const syncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!userId) {
      syncedFor.current = null
      return
    }
    if (syncedFor.current === userId) return
    syncedFor.current = userId
    base.current = readBase()?.userId === userId ? readBase() : null
    void sync()
  }, [userId, sync])

  /* --------------------------- subir tras cada cambio --------------------------- */

  useEffect(() => {
    if (!userId) return
    const current = fingerprint(state)
    // Hasta que no se ha mirado la nube por primera vez no se sube nada: podría pisar lo de otro dispositivo.
    if (settled.current === null || settled.current === current) return
    const handle = window.setTimeout(() => {
      void enqueue(async () => {
        if (settled.current === fingerprint(stateRef.current)) {
          setStatus('synced')
          return
        }
        await push()
      })
    }, 1200)
    return () => window.clearTimeout(handle)
    // `integrated` cambia al combinar la nube: reevalúa si queda algo propio por subir.
  }, [state, userId, enqueue, push, integrated])

  /* ------------------------------ ponerse al día ------------------------------ */

  // Otro dispositivo puede haber guardado: se mira al volver a la app, al recuperar la red y cada poco.
  useEffect(() => {
    if (!userId) return
    const refresh = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    const onOnline = () => void sync()
    const onOffline = () => setStatus('offline')
    const timer = window.setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [userId, sync])

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
    // Con la sesión aún abierta, para que el servidor deje de avisar a este dispositivo de esta cuenta.
    await disablePush()
    await client.auth.signOut()
    toast(t('auth.signedOut'), { tone: 'info' })
  }, [t, toast])

  const syncNow = useCallback(async () => {
    await sync()
  }, [sync])

  const value = useMemo<SyncValue>(
    () => ({
      available,
      email: session?.user.email ?? null,
      userId,
      status,
      lastSyncedAt,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [available, session, userId, status, lastSyncedAt, signIn, signUp, signOut, syncNow],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}
