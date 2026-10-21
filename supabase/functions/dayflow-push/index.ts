// Envío de avisos push de DayFlow (Supabase Edge Function, Deno).
//
// Tres usos, todos con POST:
//  · { action: 'key' }  → devuelve la clave pública VAPID (la crea la primera vez).
//  · { action: 'tick' } → lo llama el programador cada minuto con la cabecera x-cron-secret;
//                         envía los avisos que ya tocan.
//  · { action: 'test' } → con la sesión del usuario: manda un aviso de prueba a sus dispositivos.
//
// La función no tiene verificación de JWT de la plataforma porque hace la suya: el secreto del
// programador o la sesión del usuario, según la acción.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const SITE = 'https://dayflow-chi-vert.vercel.app'
/** Máximo de avisos seguidos a un mismo dispositivo; el resto se resume en uno. */
const MAX_BURST = 3

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface Config {
  vapid_public: string
  vapid_private: string
  cron_secret: string
}

async function loadConfig(): Promise<Config> {
  const { data, error } = await admin.from('dayflow_push_config').select('*').eq('id', true).single()
  if (error || !data) throw new Error(`Sin configuración: ${error?.message ?? 'fila vacía'}`)
  if (data.vapid_public && data.vapid_private) return data as Config
  // Primera vez: las claves se crean aquí y la privada no sale nunca del servidor.
  const keys = webpush.generateVAPIDKeys()
  const { data: saved, error: saveError } = await admin
    .from('dayflow_push_config')
    .update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey })
    .eq('id', true)
    .is('vapid_public', null)
    .select()
    .single()
  if (saveError || !saved) {
    // Otra llamada se adelantó: se usan las suyas.
    const again = await admin.from('dayflow_push_config').select('*').eq('id', true).single()
    if (again.data?.vapid_public) return again.data as Config
    throw new Error(`No se pudieron guardar las claves: ${saveError?.message ?? ''}`)
  }
  return saved as Config
}

interface Target {
  endpoint: string
  p256dh: string
  auth_secret: string
}

interface Payload {
  title: string
  body: string
  url: string
  tag: string
}

/** Envía y devuelve false si el dispositivo ya no existe (hay que olvidarlo). */
async function send(target: Target, payload: Payload, ttl: number): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_secret } },
      JSON.stringify(payload),
      { TTL: ttl, urgency: 'high' },
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await admin.from('dayflow_push_subscriptions').delete().eq('endpoint', target.endpoint)
      return false
    }
    console.error('push falló', status, (err as Error).message)
    return true
  }
}

async function tick() {
  const { data, error } = await admin.rpc('dayflow_push_claim', { p_limit: 200 })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{
    endpoint: string
    key: string
    title: string
    body: string
    url: string
    event_at: string
    p256dh: string
    auth_secret: string
  }>

  const byDevice = new Map<string, typeof rows>()
  for (const row of rows) byDevice.set(row.endpoint, [...(byDevice.get(row.endpoint) ?? []), row])

  const now = Date.now()
  let sent = 0
  for (const list of byDevice.values()) {
    const target = list[0]
    const shown = list.slice(0, MAX_BURST)
    for (const row of shown) {
      // Pasado el suceso el aviso ya no sirve: que no se entregue tarde si el móvil estaba apagado.
      const ttl = Math.max(60, Math.min(3600, Math.floor((Date.parse(row.event_at) - now) / 1000)))
      const alive = await send(target, { title: row.title, body: row.body, url: row.url, tag: row.key }, ttl)
      sent++
      if (!alive) break
    }
    const rest = list.length - shown.length
    if (rest > 0) {
      await send(
        target,
        { title: rest === 1 ? 'Y 1 aviso más' : `Y ${rest} avisos más`, body: '', url: '#/today', tag: 'dayflow-more' },
        600,
      )
    }
  }

  // Limpieza: lo que ya pasó hace días no hace falta.
  await admin
    .from('dayflow_push_queue')
    .delete()
    .lt('event_at', new Date(now - 2 * 24 * 3600 * 1000).toISOString())

  return { due: rows.length, sent }
}

async function test(jwt: string, endpoint: string | undefined) {
  const { data: auth, error } = await admin.auth.getUser(jwt)
  if (error || !auth.user) return json({ error: 'Sesión no válida' }, 401)

  let query = admin.from('dayflow_push_subscriptions').select('endpoint,p256dh,auth_secret').eq('user_id', auth.user.id)
  if (endpoint) query = query.eq('endpoint', endpoint)
  const { data: subs } = await query
  if (!subs?.length) return json({ sent: 0, error: 'Este dispositivo no está registrado' }, 404)

  let sent = 0
  for (const sub of subs) {
    const alive = await send(
      sub as Target,
      { title: 'DayFlow', body: 'Así te llegarán los avisos, aunque la app esté cerrada.', url: '#/settings', tag: 'dayflow-test' },
      120,
    )
    if (alive) sent++
  }
  return json({ sent })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; endpoint?: string }
    const config = await loadConfig()
    webpush.setVapidDetails(SITE, config.vapid_public, config.vapid_private)

    if (body.action === 'key') return json({ publicKey: config.vapid_public })

    if (body.action === 'tick') {
      if (req.headers.get('x-cron-secret') !== config.cron_secret) return json({ error: 'No autorizado' }, 401)
      return json(await tick())
    }

    if (body.action === 'test') {
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!jwt) return json({ error: 'Falta la sesión' }, 401)
      return await test(jwt, body.endpoint)
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message }, 500)
  }
})
