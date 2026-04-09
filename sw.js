// sw.js — henryzimmerman.net
// Strategy:
//   - Static assets (JS, CSS, JSON, fonts, images): cache-first, background-update
//   - HTML pages: network-first, fall back to cache
//   - Third-party (gstatic fonts, jsdelivr, alasky): cache-first, no fallback
//
// Bump CACHE_VERSION when deploying changes to force all clients to re-fetch.
const CACHE_VERSION = 'v5';
const CACHE_STATIC  = `static-${CACHE_VERSION}`;
const CACHE_PAGES   = `pages-${CACHE_VERSION}`;
const CACHE_THIRD   = `third-party-${CACHE_VERSION}`;

// Pre-cached on install. These are the assets that matter most on first repeat visit.
const PRECACHE = [
  '/',
  '/js/main.js',
  '/css/deferred.css',
  '/data/stars_named.json',
  '/data/stars_bg.bin',
  '/favicon.svg',
  // EB Garamond woff2 — bump CACHE_VERSION if Google updates these URLs
  'https://fonts.gstatic.com/s/ebgaramond/v32/SlGUmQSNjdsmc35JDF1K5GR1SDk_YAPI.woff2',
  'https://fonts.gstatic.com/s/ebgaramond/v32/SlGWmQSNjdsmc35JDF1K5GRweDs1ZyHKpWg.woff2',
];

// ── Install: pre-cache core assets ───────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![CACHE_STATIC, CACHE_PAGES, CACHE_THIRD].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Third-party origins: cache-first, no fallback needed
  if (url.origin === 'https://fonts.gstatic.com' ||
      url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(request, CACHE_THIRD));
    return;
  }

  // Skip non-same-origin
  if (url.origin !== self.location.origin) return;

  // HTML: network-first so content updates land immediately
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(networkFirst(request, CACHE_PAGES));
    return;
  }

  // Everything else (JS, CSS, JSON, images, fonts): cache-first
  e.respondWith(cacheFirst(request, CACHE_STATIC));
});

// ── Strategies ────────────────────────────────────────────────────────────────

// Cache-first: serve from cache immediately; update cache in background.
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  const fetchProm = fetch(request)
    .then(res => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || fetchProm;
}

// Network-first: try network, fall back to cache on failure.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return cache.match(request);
  }
}
