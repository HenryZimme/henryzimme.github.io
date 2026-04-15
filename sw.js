// sw.js — henryzimmerman.net
// strat:
//   - static assets (JS, CSS, JSON, fonts, images): cache-first, background-update
//   - HTML pages: network-first, fall back to cache
//   - 3rd-party (gstatic fonts, jsdelivr, alasky): cache-first, no fallback
//
// bump CACHE_VERSION when deploying changes to force all clients to re-fetch.
const CACHE_VERSION = 'v27';
const CACHE_STATIC  = `static-${CACHE_VERSION}`;
const CACHE_PAGES   = `pages-${CACHE_VERSION}`;
const CACHE_THIRD   = `third-party-${CACHE_VERSION}`;

// pre-cached on install. Keep this list small: only JS, CSS, and small JSON.
// large binaries (stars_bg.bin, images) must NOT be here: CacheStorage reads for large files are catastrophically slow on low-end devices. 
// serve those w/ HTTP Cache-Control headers instead (max-age=86400, immutable on Cloudflare).
const PRECACHE = [
  '/',
  '/js/main.js',
  '/css/deferred.css',
  '/data/stars_named.json',
  '/favicon.svg',
  // EB Garamond woff2: bump CACHE_VERSION if Google updates these URLs
  'https://fonts.gstatic.com/s/ebgaramond/v32/SlGUmQSNjdsmc35JDF1K5GR1SDk_YAPI.woff2',
  'https://fonts.gstatic.com/s/ebgaramond/v32/SlGWmQSNjdsmc35JDF1K5GRweDs1ZyHKpWg.woff2',
];

// ---
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ---
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

// ---
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

  if (url.origin !== self.location.origin) return;

  // HTML: network-first so content updates land immediately
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(networkFirst(request, CACHE_PAGES));
    return;
  }

  // everything else (JS, CSS, JSON, images, fonts): cache-first
  e.respondWith(cacheFirst(request, CACHE_STATIC));
});

// ---

// cache-first with stale-while-revalidate.
// background refresh ONLY fires on a cache hit — not unconditionally.
// this prevents re-downloading the full PRECACHE on every page visit.
// pair with Cache-Control: max-age=3600 on origin responses so background
// refetches return 304 Not Modified when nothing has changed.
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Serve stale immediately; refresh in background.
    fetch(request)
      .then(res => { if (res.ok) cache.put(request, res.clone()); })
      .catch(() => {});
    return cached;
  }

  // cache miss: single fetch, store, and return.
  const res = await fetch(request).catch(() => null);
  if (res?.ok) cache.put(request, res.clone());
  return res;
}

// network-first: try network, fall back to cache on failure.
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
