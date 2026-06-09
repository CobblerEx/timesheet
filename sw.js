// ── Timesheet PWA — Service Worker ──────────────────────────────────────────
// Bump the cache name any time you deploy updated files so old caches are
// cleared automatically on the next visit.
const CACHE = 'timesheet-v4';

// App shell + all CDN assets needed to run fully offline
const FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // PDF generation
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.3/jspdf.plugin.autotable.min.js',
  // Spreadsheet export
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  // Zip export
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  // Icons
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
];

// ── Install: pre-cache everything ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete any old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app files, network-first for everything else ──────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Serve root or bare path from cached index.html
  if (url.pathname === '/' || url.pathname === '') {
    event.respondWith(caches.match('./index.html'));
    return;
  }

  // Cache-first strategy: perfect for a static offline app
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      // Not in cache — try the network then cache the result
      return fetch(request)
        .then(response => {
          // Only cache valid responses
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fully offline and not cached — fall back to the app shell
          return caches.match('./index.html');
        });
    })
  );
});

// ── Message handler: force update on user confirmation ──────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
