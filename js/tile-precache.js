/* Offline tile pre-cacher — tiered multi-region download strategy
   ─────────────────────────────────────────────────────────────────
   Tier 1  Full route corridor   z4–z11  topo/places/roads
                                 z4–z9   sat  (overview only — stays small)
   Tier 2  Non-Yellowstone stops z12–z13 topo/places/roads
           (Casper, Cody, Commerce City, Thermopolis, Fort Collins)
   Tier 3  Full Yellowstone park z12–z13 topo/places/roads
           (navigation-level — road names, lake shores, thermal areas)
   Tier 4  Yellowstone Grand Loop core z14 topo
           (7 m/px — campsite loops, trailheads, boardwalks visible)

   Estimated total: ~65 k tiles / ~380 MB
   Tuned to stay under 400 MB while giving maximum Yellowstone detail.
*/

/* ── Bounding boxes ──────────────────────────────────────────────────────── */
const FULL_BBOX = { west: -111.2, south: 39.6, east: -104.4, north: 45.2 };

/* Full Yellowstone park bbox (used at z12–z13 navigation zoom) */
const YELL_BBOX = { west: -111.2, south: 44.0, east: -109.8, north: 45.2 };

/* Grand Loop core — covers Old Faithful, Fishing Bridge, Canyon, Mammoth,
   Norris, Madison, West Thumb. Used at z14 for highest map detail. */
const YELL_CORE = { west: -110.9, south: 44.35, east: -110.0, north: 45.05 };

/* Non-Yellowstone key stops — pad ±0.12° (~9 km) around each centre */
const PAD = 0.12;
function stopBox(lng, lat) {
  return { west: lng - PAD, east: lng + PAD, south: lat - PAD, north: lat + PAD };
}
const STOP_BOXES = [
  { id: 'commerce-city', box: stopBox(-104.94, 39.83) }, // Road Bear depot + DIA area
  { id: 'casper',        box: stopBox(-106.34, 42.91) }, // Casper KOA nights 1 & 5
  { id: 'thermopolis',   box: stopBox(-108.21, 43.65) }, // Hot Springs stop
  { id: 'cody',          box: stopBox(-109.07, 44.52) }, // Cody KOA + rodeo + museum
  { id: 'fort-collins',  box: stopBox(-105.08, 40.58) }, // Fort Collins KOA night 6
];

/* ── Source URL factories ────────────────────────────────────────────────── */
const SRC_URL = {
  topo:   (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
  sat:    (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  places: (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
  roads:  (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`,
};

/* ── Region definitions ──────────────────────────────────────────────────── */
const REGIONS = [
  /* Tier 1 — full corridor */
  { id: 'full-topo',   bbox: FULL_BBOX, layers: ['topo'],           minZ: 4, maxZ: 11 },
  { id: 'full-sat',    bbox: FULL_BBOX, layers: ['sat'],            minZ: 4, maxZ: 9  },
  { id: 'full-labels', bbox: FULL_BBOX, layers: ['places', 'roads'],minZ: 4, maxZ: 11 },

  /* Tier 2 — non-Yellowstone stop boxes */
  ...STOP_BOXES.map(s => ({
    id: `stop-${s.id}`, bbox: s.box, layers: ['topo', 'places', 'roads'], minZ: 12, maxZ: 13,
  })),

  /* Tier 3 — Yellowstone full park, navigation zoom */
  { id: 'yell-topo',   bbox: YELL_BBOX, layers: ['topo'],           minZ: 12, maxZ: 13 },
  { id: 'yell-labels', bbox: YELL_BBOX, layers: ['places', 'roads'],minZ: 12, maxZ: 13 },

  /* Tier 4 — Yellowstone Grand Loop core, highest map detail */
  { id: 'yell-core',   bbox: YELL_CORE, layers: ['topo'],           minZ: 14, maxZ: 14 },
];

/* ── Cache constants ─────────────────────────────────────────────────────── */
const SAT_CACHE   = 'rv-trip-satellite-v7';
const DONE_KEY    = 'rv-tiles-precached-v7';
const CONCURRENCY = 8;

/* ── Public API ──────────────────────────────────────────────────────────── */

export function tilesAlreadyCached() {
  return !!localStorage.getItem(DONE_KEY);
}

/**
 * Download all trip-area tiles into the cache.
 * @param {function(pct:number, done:number, total:number, regionId:string):void} onProgress
 * @returns {Promise<{ok:number, skipped:number, failed:number, quotaHit:boolean}>}
 */
export async function preCacheMapTiles(onProgress) {
  const cache = await caches.open(SAT_CACHE);

  const allTiles = buildTileList();
  const total = allTiles.length;
  let done = 0, ok = 0, failed = 0, skipped = 0;
  let quotaHit = false;

  for (let i = 0; i < allTiles.length; i += CONCURRENCY) {
    if (quotaHit) break;

    const batch = allTiles.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async ({ url, regionId }) => {
      const cached = await cache.match(url);
      if (cached) { skipped++; return 'skipped'; }

      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) { failed++; return 'failed'; }

      await cache.put(url, res);
      ok++;
      return 'ok';
    }));

    for (const r of results) {
      if (r.status === 'rejected') {
        const err = r.reason;
        if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                    (err.message && err.message.toLowerCase().includes('quota')))) {
          quotaHit = true;
        } else {
          failed++;
        }
      }
    }

    done = Math.min(i + CONCURRENCY, total);
    onProgress?.(Math.round(done / total * 100), done, total,
      batch[0]?.regionId ?? '');

    await new Promise(r => setTimeout(r, 0));
  }

  const stats = { ok, skipped, failed, quotaHit };

  if (!quotaHit) {
    localStorage.setItem(DONE_KEY, JSON.stringify({ ts: new Date().toISOString(), ...stats }));
  }

  return stats;
}

export function countTiles() {
  return buildTileList().length;
}

export function resetTileCache() {
  localStorage.removeItem(DONE_KEY);
}

/* ── Internal helpers ────────────────────────────────────────────────────── */

function buildTileList() {
  const seen = new Set();
  const list = [];

  for (const region of REGIONS) {
    for (const layer of region.layers) {
      const urlFn = SRC_URL[layer];
      for (let z = region.minZ; z <= region.maxZ; z++) {
        for (const { x, y } of tilesForBbox(region.bbox, z)) {
          const url = urlFn(z, y, x);
          if (!seen.has(url)) {
            seen.add(url);
            list.push({ url, regionId: region.id });
          }
        }
      }
    }
  }
  return list;
}

function lonToX(lon, z) {
  return Math.floor((lon + 180) / 360 * 2 ** z);
}
function latToY(lat, z) {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
}
function* tilesForBbox({ west, east, north, south }, z) {
  const x1 = lonToX(west, z),  x2 = lonToX(east, z);
  const y1 = latToY(north, z), y2 = latToY(south, z);
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      yield { x, y };
}
