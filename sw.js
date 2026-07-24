const CACHE_NAME = 'redvsblue-cache-v32';
const ASSETS = [
  './',
  './index.html',
  './duel.html',
  './manifest.json',
  './css/style.css',
  './js/scenarios.js',
  './js/chains.js',
  './js/progression.js',
  './js/network-map.js',
  './js/engine.js',
  './js/ui.js',
  './js/hero-fx.js',
  './js/main.js',
  './js/duel.js',
  './js/recap.js',
  './js/procedural.js',
  './js/editor.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first : on prend toujours la version réseau quand elle est
// disponible (les modifs s'affichent direct), et on ne retombe sur le
// cache que hors-ligne.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
