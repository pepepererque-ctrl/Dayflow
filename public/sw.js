/*
 * Service worker de DayFlow.
 *
 * Dos trabajos:
 *  1. Que la app abra sin conexión después de la primera carga.
 *  2. Mostrar los avisos y llevar a la pantalla correcta al pulsarlos.
 *
 * No toca nada que no sea de este mismo origen: la sincronización con Supabase
 * va directa a la red, sin pasar por la caché.
 */

// Súbelo si cambia la estrategia de caché. Los archivos de la app llevan hash en
// el nombre, así que una versión nueva de la app no necesita tocar esto.
const VERSION = 'dayflow-shell-v2'

const scopeUrl = new URL(self.registration.scope)
const here = (path) => new URL(path, scopeUrl).toString()

/** Archivos de arranque, deducidos del index.html para no mantener una lista a mano. */
async function precache() {
  const cache = await caches.open(VERSION)
  const indexUrl = here('./')
  const response = await fetch(indexUrl, { cache: 'reload' })
  const html = await response.clone().text()
  await cache.put(indexUrl, response)

  const assets = new Set([here('manifest.webmanifest'), here('icon-192.png')])
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|svg|webmanifest))"/g)) {
    const url = new URL(match[1], indexUrl)
    if (url.origin === scopeUrl.origin) assets.add(url.toString())
  }
  // Las fuentes salen del CSS, no del HTML: se leen de ahí para tenerlas también sin conexión.
  for (const url of [...assets].filter((u) => u.endsWith('.css'))) {
    try {
      const css = await (await fetch(url)).text()
      for (const m of css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)) {
        const font = new URL(m[1], url)
        if (font.origin === scopeUrl.origin) assets.add(font.toString())
      }
    } catch {
      /* sin el CSS no hay fuentes que añadir; la app sigue funcionando */
    }
  }

  // Un archivo que falle no debe impedir instalar el resto.
  await Promise.all([...assets].map((url) => cache.add(url).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== scopeUrl.origin) return

  // La página: red primero (así las versiones nuevas llegan), caché si no hay conexión.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(here('./'), copy))
          return response
        })
        .catch(() => caches.match(here('./'))),
    )
    return
  }

  // Todo lo demás (JS, CSS, fuentes, iconos): caché primero y se rellena sobre la marcha.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

/* --------------------------------- avisos --------------------------------- */

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || './#/today', scopeUrl)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === scopeUrl.origin)
      if (open) {
        // La app ya está abierta: se enfoca y se le pide que vaya a esa pantalla.
        open.postMessage({ type: 'navigate', hash: target.hash })
        return open.focus()
      }
      return self.clients.openWindow(target.toString())
    }),
  )
})
