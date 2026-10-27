const PREFIX = 'pomotrack-'
const CACHE = `${PREFIX}v1`
const PAGE = './'
// Every file of the app, so it works offline. e2e/pwa.spec.ts checks that no file in dist is missing.
const ASSETS = [
  PAGE,
  './app.css',
  './js/main.js',
  './js/alerts.js',
  './js/dialogs.js',
  './js/dom.js',
  './js/drag.js',
  './js/format.js',
  './js/history-view.js',
  './js/model.js',
  './js/render.js',
  './js/shortcuts.js',
  './js/store.js',
  './js/task-forms.js',
  './js/tasks-view.js',
  './js/tasks.js',
  './js/timer-view.js',
  './js/timer.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
]
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
  // The page, its style sheet and its modules have to come from the same deploy. A cached module that is older than
  // the page would not match it. So every file comes from the network, and from the cache only when that fails.
  if (req.mode !== 'navigate') e.respondWith(networkFirst(e, req))
  else if (isAppPage(url)) e.respondWith(networkFirst(e, PAGE))
})

async function networkFirst(e, key) {
  try {
    const res = await fetch(e.request, REVALIDATE)
    if (res.ok) {
      e.waitUntil(cache.then((c) => c.put(key, res.clone())))
      return res
    }
    // A server error, for example during a deploy, shows the copy that worked last time
    return (await (await cache).match(key)) ?? res
  } catch {
    return (await (await cache).match(key)) ?? Response.error()
  }
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
