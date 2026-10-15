// sw.js | henryzimmerman.net
// strat:
//   - static assets (JS, CSS, JSON, fonts, images): cache-first, background-update
//   - HTML pages: network-first, fall back to cache
//   - fonts and KaTeX are self-hosted and ride the same-origin static path
//   - responses over MAX_CACHE_BYTES (PDFs) are left to the HTTP cache
//
// bump CACHE_VERSION when deploying changes to force all clients to re-fetch.
const CACHE_VERSION = 'v50';
const CACHE_STATIC  = `static-${CACHE_VERSION}`;
const CACHE_PAGES   = `pages-${CACHE_VERSION}`;
const MAX_CACHE_BYTES = 2_000_000;

// pre-cached on install. Keep this list small: only JS, CSS, and small JSON.
// large binaries (stars_bg.bin, images) must NOT be here: CacheStorage reads for large files are catastrophically slow on low-end devices. 
// serve those w/ HTTP Cache-Control headers instead (max-age=86400, immutable on Cloudflare).
const PRECACHE = [
  '/js/main.js',
  '/css/deferred.css',
  '/css/subpages.css',
  '/css/fonts.css',
  '/js/writing-nav.js',
  '/data/stars_named.json',
  '/favicon.svg',
  '/assets/fonts/eb-garamond-latin-400-normal.woff2',
  '/assets/fonts/eb-garamond-latin-400-italic.woff2',
];

// ---
self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))),
      caches.open(CACHE_PAGES).then(c => c.add('/').catch(() => {})),
    ]).then(() => self.skipWaiting())
  );
});

// ---
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![CACHE_STATIC, CACHE_PAGES].includes(k))
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

function cacheable(res) {
  if (!res.ok) return false;
  if ((res.headers.get('content-type') || '').includes('application/pdf')) return false;
  return Number(res.headers.get('content-length') || 0) <= MAX_CACHE_BYTES;
}

// cache-first with stale-while-revalidate.
// background refresh ONLY fires on a cache hit — not unconditionally.
// this prevents re-downloading the full PRECACHE on every page visit.
// pair with Cache-Control: max-age=86400 on origin responses (matching the
// Cloudflare edge rule above) so background refetches return 304 Not Modified
// when nothing has changed.
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Serve stale immediately; refresh in background.
    fetch(request)
      .then(res => { if (cacheable(res)) cache.put(request, res.clone()); })
      .catch(() => {});
    return cached;
  }

  // cache miss: single fetch, store, and return.
  const res = await fetch(request).catch(() => null);
  if (res && cacheable(res)) cache.put(request, res.clone());
  return res;
}

// network-first: try network, fall back to cache on failure.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch {
    return cache.match(request);
  }
}
