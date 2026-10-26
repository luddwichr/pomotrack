const PREFIX = 'pomotrack-'
const CACHE = `${PREFIX}v1`
const PAGE = './'
const ASSETS = [PAGE, './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']
const SCOPE_PATH = new URL(self.registration.scope).pathname
// The app page has several URLs: the folder, index.html, and both with any query string. They all share one cached
// copy under PAGE, so each of them works offline and a visit to any of them updates the copy after a deploy.
// Only a navigation to the app page updates that copy. Opening another file of the app in a tab must not replace it.
const isAppPage = (url) => url.pathname === SCOPE_PATH || url.pathname === `${SCOPE_PATH}index.html`
const cache = caches.open(CACHE)
// GitHub Pages sends max-age=600, so the browser's HTTP cache could answer with a copy up to 10 minutes old, also right
// after a deploy. Every fetch of the app's files checks with the server instead, which usually costs a short 304.
const REVALIDATE = { cache: 'no-cache' }

self.addEventListener('install', (e) => {
  e.waitUntil(
    cache.then((c) => c.addAll(ASSETS.map((url) => new Request(url, REVALIDATE)))).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (req.mode !== 'navigate') e.respondWith(staleWhileRevalidate(e))
  else if (isAppPage(url)) e.respondWith(networkFirst(e))
})

async function networkFirst(e) {
  try {
    const res = await fetch(e.request, REVALIDATE)
    if (res.ok) {
      e.waitUntil(cache.then((c) => c.put(PAGE, res.clone())))
      return res
    }
    // A server error, for example during a deploy, shows the copy that worked last time
    return (await (await cache).match(PAGE)) ?? res
  } catch {
    return (await (await cache).match(PAGE)) ?? Response.error()
  }
}

async function staleWhileRevalidate(e) {
  const c = await cache
  const cached = await c.match(e.request)
  const refresh = fetch(e.request, REVALIDATE).then((res) => {
    if (res.ok) e.waitUntil(c.put(e.request, res.clone()))
    return res
  })
  if (!cached) return refresh
  e.waitUntil(refresh.catch(() => {}))
  return cached
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    // Other apps on the same origin, like other GitHub Pages projects, have windows in this list too
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => isAppPage(new URL(c.url)))
      return client ? client.focus() : self.clients.openWindow('./')
    }),
  )
})
