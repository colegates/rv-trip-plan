/* Service Worker — offline-first PWA
   Cache version: bump CACHE_VERSION to force a full refresh on all clients.
*/

const CACHE_VERSION = 'v1';
const CACHE_NAME    = `rv-trip-${CACHE_VERSION}`;

/* App shell + data files to precache on install */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/validator.js',
  './js/gps.js',
  './js/map-init.js',
  './js/markers.js',
  './js/ui-import.js',
  './js/ui-itinerary.js',
  './lib/maplibre-gl.js',
  './lib/maplibre-gl.css',
  './lib/pmtiles.js',
  './trip.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

/* PMTiles basemap — large file, handled separately with range-request caching */
const PMTILES_FILENAME = 'basemap.pmtiles';
const PMTILES_URL      = new URL(`./${PMTILES_FILENAME}`, self.location.href).href;

/* ── Install ─────────────────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      /* Precache app shell files */
      await precacheShell(cache);

      /* Precache basemap PMTiles (may not exist yet if user hasn't built it) */
      await cachePMTiles(cache);

      self.skipWaiting();
    })()
  );
});

async function precacheShell(cache) {
  const base = new URL('./', self.location.href).href;
  let done = 0;
  for (const relUrl of PRECACHE_URLS) {
    const url = new URL(relUrl, base).href;
    try {
      /* Skip if already cached */
      const existing = await cache.match(url);
      if (existing) { done++; continue; }

      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch (e) {
      console.warn(`[SW] Precache miss: ${relUrl}`, e.message);
    }
    done++;
    notifyProgress(Math.round((done / PRECACHE_URLS.length) * 60),
                   `Caching ${relUrl.split('/').pop()}…`);
  }
}

async function cachePMTiles(cache) {
  /* Check if already cached (keyed by bare URL, no range header) */
  const existing = await cache.match(PMTILES_URL);
  if (existing) {
    notifyProgress(100, 'Basemap already cached ✓');
    return;
  }

  try {
    notifyProgress(60, 'Downloading basemap (may take a moment)…');
    const res = await fetch(PMTILES_URL);
    if (!res.ok) {
      console.warn('[SW] PMTiles not found — map will not work offline until basemap.pmtiles is deployed.');
      notifyProgress(100, 'Basemap not available (see README)');
      return;
    }

    /* Clone and store the full file (no Range header) */
    const fullBody = await res.blob();
    const storedRes = new Response(fullBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fullBody.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'max-age=31536000',
      }
    });
    await cache.put(PMTILES_URL, storedRes);
    notifyProgress(100, `Basemap cached (${(fullBody.size / 1048576).toFixed(1)} MB) ✓`);

  } catch (e) {
    console.warn('[SW] PMTiles cache failed:', e.message);
    notifyProgress(100, 'Basemap cache failed — map works online only');
  }
}

function notifyProgress(progress, status) {
  self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      client.postMessage({ type: 'precache-progress', progress, status });
    }
  });
}

/* ── Activate — delete old caches ────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k.startsWith('rv-trip-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* ── Fetch ───────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and cross-origin (except OSRM which we let pass through) */
  if (request.method !== 'GET') return;

  /* PMTiles range requests → serve sliced from cached blob */
  if (request.url === PMTILES_URL || url.pathname.endsWith('.pmtiles')) {
    event.respondWith(handlePMTilesRequest(request));
    return;
  }

  /* OSRM routing — network-only, no caching */
  if (url.hostname.includes('project-osrm.org')) return;

  /* Everything else: cache-first */
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok && res.status < 300) {
      cache.put(request, res.clone()); /* async, best-effort */
    }
    return res;
  } catch (e) {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

/* ── PMTiles range-request handler ──────────────────────────────────────── */
async function handlePMTilesRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const fullRes = await cache.match(PMTILES_URL);

  if (fullRes) {
    const rangeHeader = request.headers.get('Range');
    if (!rangeHeader) return fullRes.clone();

    /* Serve range slice from cached blob */
    const blob = await fullRes.blob();
    const [start, end] = parseRange(rangeHeader, blob.size);
    if (start < 0 || end >= blob.size || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${blob.size}` }
      });
    }

    const sliced = blob.slice(start, end + 1);
    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Range':  `bytes ${start}-${end}/${blob.size}`,
        'Content-Length': String(end - start + 1),
        'Content-Type':   'application/octet-stream',
        'Accept-Ranges':  'bytes',
      }
    });
  }

  /* Not in cache — pass through to network */
  try {
    return await fetch(request);
  } catch {
    return new Response('PMTiles offline — basemap not cached', { status: 503 });
  }
}

function parseRange(rangeHeader, fileSize) {
  const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!m) return [0, fileSize - 1];
  const start = parseInt(m[1], 10);
  const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1;
  return [start, Math.min(end, fileSize - 1)];
}

/* ── Message handler (skip-waiting trigger) ──────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
