/* Offline tile pre-cacher — tiered multi-region download strategy
   ─────────────────────────────────────────────────────────────────
   Tier 1  Full route corridor   z4–z12  topo/places/roads
                                 z4–z11  sat  (overview only)
   Tier 2  Non-Yellowstone stops z13–z15 topo/places/roads
           (~9 km boxes: Commerce City, Casper, Thermopolis, Cody, Fort Collins)
   Tier 3  Yellowstone park      z13–z16 topo/places/roads (map view only)
           No high-detail satellite — sat stays at overview level everywhere.

   Total: ~200k tiles / ~3.1 GB
   z16 topo = ~2.4 m/px — individual trails, campsite loops, boardwalks visible
*/

/* ── Bounding boxes ──────────────────────────────────────────────────────── */
const FULL_BBOX = { west: -111.2, south: 39.6, east: -104.4, north: 45.2 };
const YELL_BBOX = { west: -111.2, south: 44.0, east: -109.8, north: 45.2 };

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
  // Yellowstone stops (Fishing Bridge, Old Faithful, Canyon) are covered by
  // the full YELL_BBOX Tier 3 below — no separate stop boxes needed.
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
  /* Tier 1 — full corridor, driving-level detail */
  { id: 'full-topo',   bbox: FULL_BBOX, layers: ['topo'],           minZ: 4, maxZ: 12 },
  { id: 'full-sat',    bbox: FULL_BBOX, layers: ['sat'],            minZ: 4, maxZ: 11 },
  { id: 'full-labels', bbox: FULL_BBOX, layers: ['places', 'roads'],minZ: 4, maxZ: 12 },

  /* Tier 2 — non-Yellowstone stop boxes, campsite-level topo (z13–z15) */
  ...STOP_BOXES.map(s => ({
    id: `stop-${s.id}`, bbox: s.box, layers: ['topo', 'places', 'roads'], minZ: 13, maxZ: 15,
  })),

  /* Tier 3 — Yellowstone: full park at highest map detail (topo only) */
  { id: 'yell-topo',   bbox: YELL_BBOX, layers: ['topo'],           minZ: 13, maxZ: 16 },
  { id: 'yell-labels', bbox: YELL_BBOX, layers: ['places', 'roads'],minZ: 13, maxZ: 15 },
];

/* ── Cache constants ─────────────────────────────────────────────────────── */
const SAT_CACHE   = 'rv-trip-satellite-v5';
const DONE_KEY    = 'rv-tiles-precached-v5';
const CONCURRENCY = 16;  /* parallel fetches — more headroom for the larger set */

/* ── Public API ──────────────────────────────────────────────────────────── */

export function tilesAlreadyCached() {
  return !!localStorage.getItem(DONE_KEY);
}

/**
 * Download all trip-area tiles into the cache.
 * @param {function(pct:number, done:number, total:number, regionId:string):void} onProgress
 */
export async function preCacheMapTiles(onProgress) {
  const cache = await caches.open(SAT_CACHE);

  const allTiles = buildTileList();
  const total = allTiles.length;
  let done = 0;

  for (let i = 0; i < allTiles.length; i += CONCURRENCY) {
    const batch = allTiles.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async ({ url, regionId }) => {
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (res.ok) await cache.put(url, res.clone());
        }
      } catch { /* skip on network error — tile fetched on demand when online */ }
      done++;
      onProgress?.(Math.round(done / total * 100), done, total, regionId);
    }));
    await new Promise(r => setTimeout(r, 0)); /* yield to keep UI responsive */
  }

  localStorage.setItem(DONE_KEY, new Date().toISOString());
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
