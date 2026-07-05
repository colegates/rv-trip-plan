/* Offline tile pre-cacher
   Downloads every map tile for the trip bounding box into the SW cache so
   both topo and satellite views work fully offline after first open.
*/

/* Trip area bbox — same as the basemap workflow default */
const BBOX = { west: -111.2, south: 39.6, east: -104.4, north: 45.2 };

/* Zoom ranges per source (higher zoom = more tiles & larger files)
   Budget: ~3x original — topo/sat gain one extra zoom level each.
   topo z12 adds trail names, contour detail, small roads.
   sat  z11 adds road-level satellite resolution across the trip corridor. */
const SOURCES = [
  { id: 'topo',    minZ: 4, maxZ: 12,
    url: (z,y,x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}` },
  { id: 'sat',     minZ: 4, maxZ: 11,
    url: (z,y,x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}` },
  { id: 'places',  minZ: 4, maxZ: 11,
    url: (z,y,x) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}` },
  { id: 'roads',   minZ: 4, maxZ: 11,
    url: (z,y,x) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}` },
];

const SAT_CACHE  = 'rv-trip-satellite-v2';
const DONE_KEY   = 'rv-tiles-precached-v2';
const CONCURRENCY = 12;  /* parallel fetches — higher for bigger tile set */

/* ── Public API ─────────────────────────────────────────────────────────── */

export function tilesAlreadyCached() {
  return !!localStorage.getItem(DONE_KEY);
}

/**
 * Download all trip-area tiles into the cache.
 * @param {function(pct:number, done:number, total:number, sourceId:string):void} onProgress
 */
export async function preCacheMapTiles(onProgress) {
  const cache = await caches.open(SAT_CACHE);

  /* Build the full tile list */
  const allTiles = [];
  for (const src of SOURCES) {
    for (let z = src.minZ; z <= src.maxZ; z++) {
      for (const { x, y } of tilesForBbox(BBOX, z)) {
        allTiles.push({ url: src.url(z, y, x), sourceId: src.id });
      }
    }
  }

  const total = allTiles.length;
  let done = 0;

  for (let i = 0; i < allTiles.length; i += CONCURRENCY) {
    const batch = allTiles.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async ({ url, sourceId }) => {
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (res.ok) await cache.put(url, res.clone());
        }
      } catch { /* skip — tile will be fetched on demand when online */ }
      done++;
      onProgress?.(Math.round(done / total * 100), done, total, sourceId);
    }));
    /* Yield between batches so the UI stays responsive */
    await new Promise(r => setTimeout(r, 0));
  }

  localStorage.setItem(DONE_KEY, new Date().toISOString());
}

/** Total tile count for display before starting */
export function countTiles() {
  let n = 0;
  for (const src of SOURCES)
    for (let z = src.minZ; z <= src.maxZ; z++)
      for (const _ of tilesForBbox(BBOX, z)) n++;
  return n;
}

/** Clear the cached flag so next call to preCacheMapTiles re-downloads */
export function resetTileCache() {
  localStorage.removeItem(DONE_KEY);
}

/* ── Tile maths ──────────────────────────────────────────────────────────── */

function lonToX(lon, z) {
  return Math.floor((lon + 180) / 360 * 2 ** z);
}
function latToY(lat, z) {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
}
function* tilesForBbox({ west, east, north, south }, z) {
  const x1 = lonToX(west, z),  x2 = lonToX(east, z);
  const y1 = latToY(north, z), y2 = latToY(south, z); /* north → smaller y */
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      yield { x, y };
}
