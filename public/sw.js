/*
 * WRECKBALL service worker — makes the game installable and offline-capable.
 * HTML shells are network-first (new deploys win); hashed bundles, atlas and
 * audio are cache-first (immutable in practice). Bump VERSION to drop caches.
 */
const VERSION = 'wb-1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './atlas.png', './atlas.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  const p = url.pathname;
  const immutable = p.includes('/assets/') || p.endsWith('.png') || p.endsWith('.json') || p.endsWith('.mp3') || p.endsWith('.webmanifest');

  if (e.request.mode === 'navigate' || p.endsWith('/index.html')) {
    // network-first: a fresh deploy must win over the cached shell
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('./')))
    );
    return;
  }

  if (immutable) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  }
});
