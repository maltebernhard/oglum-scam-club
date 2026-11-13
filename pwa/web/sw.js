// Offline cache for the hosted app. The cache name carries a build hash (set by tools/build.mjs), so every new
// build installs a fresh cache and removes the old one. Needs HTTPS or localhost.
const CACHE = 'osc-@@VERSION@@'
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('osc-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    // ignoreSearch: ?selftest=on, ?debug=1 etc. must still hit the cached page.
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    )
  )
})
