/* Thunderclash service worker
 * - Precaches the app shell on install
 * - Navigations: network-first, falls back to cached shell when offline
 * - Images: network-first — tiles/art can change between deploys, freshness wins;
 *   cached copy is the offline fallback
 * - Everything else (content-hashed bundle, icons): cache-first, network fills
 * - Old cache versions are purged on activate
 */
const CACHE = 'thundrclash-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const IMAGE = /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin

  // App navigations: fresh shell when online, cached shell offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () =>
          (await caches.match(req)) ||
          (await caches.match('./index.html')) ||
          new Response('Offline — load Thunderclash once while online.', { status: 503 })
        )
    );
    return;
  }

  // Images: network-first (art/tiles change between deploys), cache = offline fallback
  if (IMAGE.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          cachePut(req, res);
          return res;
        })
        .catch(async () => (await caches.match(req)) || new Response('', { status: 504 }))
    );
    return;
  }

  // Hashed bundle + other assets: cache-first, network fills
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        cachePut(req, res);
        return res;
      });
    })
  );
});
