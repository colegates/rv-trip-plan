/* MapLibre + PMTiles initialisation, basemap style, route interactivity */

/* Day colours — must match CSS variables */
export const DAY_COLORS = {
  day1: '#c8603a', day2: '#d4872a', day3: '#4a8c3f',
  day4: '#3a7c8c', day5: '#7c4c8c', day6: '#3a4c8c', day7: '#b04060'
};

/* Approximate driving-route waypoints per day [lng, lat] (GeoJSON order) */
export const DAY_ROUTES = {
  day1: [
    [-104.9446, 39.8324], // Road Bear depot
    [-104.9281, 39.8047], // Walmart Commerce City
    [-104.9903, 39.7392], // Denver
    [-104.8202, 41.1400], // Cheyenne
    [-105.3700, 42.0670], // Douglas
    [-106.3252, 42.8501], // Casper
    [-106.3415, 42.9137], // Casper KOA
  ],
  day2: [
    [-106.3415, 42.9137], // Casper KOA
    [-106.3244, 42.8485], // Lou Taubert
    [-108.1010, 43.2336], // Shoshoni
    [-108.2058, 43.6511], // Thermopolis
    [-107.9567, 44.0166], // Worland
    [-108.0533, 44.4861], // Greybull
    [-109.0732, 44.5250], // Cody (fuel)
    [-109.1856, 44.5063], // Buffalo Bill Dam
    [-109.9000, 44.4890], // East Entrance approach
    [-110.3695, 44.5648], // Fishing Bridge
  ],
  day3: [
    [-110.3695, 44.5648], // Fishing Bridge
    [-110.4337, 44.6249], // Mud Volcano
    [-110.4686, 44.6597], // Hayden Valley (dawn)
    [-110.4686, 44.6597], // Hayden Valley (return)
    [-110.3695, 44.5648], // Fishing Bridge (back)
    [-110.5729, 44.4163], // West Thumb
    [-110.8281, 44.4605], // Old Faithful
    [-110.8382, 44.5251], // Grand Prismatic (Midway)
    [-110.8669, 44.5563], // Firehole Canyon
    [-110.8636, 44.6433], // Madison Campground
  ],
  day4: [
    [-110.8636, 44.6433], // Madison CG
    [-110.7716, 44.6519], // Gibbon Falls
    [-110.7036, 44.7263], // Norris
    [-110.4925, 44.7355], // Canyon Village
    [-110.4794, 44.7210], // Artist Point
    [-110.4925, 44.7355], // Canyon (back to main road)
    [-110.4686, 44.6597], // Hayden Valley
    [-110.3695, 44.5648], // Fishing Bridge
    [-109.9000, 44.4890], // East Entrance
    [-109.0732, 44.5250], // Cody
    [-109.0185, 44.4577], // Cody KOA
  ],
  day5: [
    [-109.0185, 44.4577], // Cody KOA
    [-109.0732, 44.5250], // Cody (fuel)
    [-108.2058, 43.6511], // Thermopolis
    [-108.1010, 43.2336], // Shoshoni
    [-106.3252, 42.8501], // Casper
    [-106.3415, 42.9137], // Casper KOA
  ],
  day6: [
    [-106.3415, 42.9137], // Casper KOA
    [-106.3252, 42.8501], // Casper
    [-105.3700, 42.0670], // Douglas
    [-104.8202, 41.1400], // Cheyenne
    [-105.0752, 40.5853], // Fort Collins
    [-105.1089, 40.6148], // Fort Collins KOA
  ],
  day7: [
    [-105.1089, 40.6148], // Fort Collins KOA
    [-105.0752, 40.5853], // Fort Collins
    [-104.9903, 39.7392], // Denver
    [-104.9446, 39.8324], // Road Bear depot
    [-104.6737, 39.8561], // DIA
  ],
};

/* In satellite mode: hide topo base, show imagery + label overlays.
   In map mode: show topo base, hide imagery + label overlays. */
let _satelliteMode = false;

export function toggleSatellite() {
  if (!_map) return false;
  _satelliteMode = !_satelliteMode;
  const topoVis = _satelliteMode ? 'none'    : 'visible';
  const satVis  = _satelliteMode ? 'visible' : 'none';
  for (const id of ['esri-topo-layer']) {
    if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', topoVis);
  }
  for (const id of ['satellite-tiles', 'esri-places-layer', 'esri-roads-layer']) {
    if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', satVis);
  }
  return _satelliteMode;
}

function buildMapStyle() {
  /* All sources are Esri raster tile services — same host (server.arcgisonline.com)
     as the satellite layer, so the existing SW satellite-tile cache covers them all.
     No PMTiles file required; tiles are cached as-you-browse for offline use. */
  return {
    version: 8,
    sources: {
      'esri-topo': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.esri.com" target="_blank">Esri</a>, HERE, Garmin, USGS, NPS',
      },
      'esri-satellite': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
      },
      'esri-places': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.esri.com" target="_blank">Esri</a>',
      },
      'esri-roads': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.esri.com" target="_blank">Esri</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8dcc8' } },

      /* Default basemap — Esri World Topo Map (terrain, roads, labels) */
      { id: 'esri-topo-layer', type: 'raster', source: 'esri-topo',
        layout: { visibility: 'visible' },
        paint: { 'raster-opacity': 1 } },

      /* Satellite imagery — hidden until 🛰️ toggle */
      { id: 'satellite-tiles', type: 'raster', source: 'esri-satellite',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 1 } },

      /* Transparent label overlays for satellite mode */
      { id: 'esri-places-layer', type: 'raster', source: 'esri-places',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 1 } },
      { id: 'esri-roads-layer', type: 'raster', source: 'esri-roads',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 1 } },
    ]
  };
}

/* ── Map instance ────────────────────────────────────────────────────────── */
let _map = null;

export function getMap() { return _map; }

export async function initMap(containerId) {
  _map = new maplibregl.Map({
    container: containerId,
    style: buildMapStyle(),
    center: [-107.8, 43.2],
    zoom: 5.5,
    minZoom: 4,
    maxZoom: 17,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false,
  });

  _map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');

  return new Promise((resolve, reject) => {
    _map.on('load', () => { addRouteLayers(); resolve(_map); });
    _map.on('error', e => {
      if (!e.error?.message?.includes('pmtiles')) reject(e.error);
    });
  });
}

/* ── Route layers ────────────────────────────────────────────────────────── */
function lineFeature(dayId, coords) {
  return { type: 'Feature', properties: { dayId }, geometry: { type: 'LineString', coordinates: coords } };
}

function addRouteLayers() {
  if (!_map) return;
  for (const [dayId, coords] of Object.entries(DAY_ROUTES)) {
    const src = `route-${dayId}`;
    /* Draw straight waypoint lines immediately so something appears offline */
    _map.addSource(src, { type: 'geojson', data: lineFeature(dayId, coords) });

    /* White casing */
    _map.addLayer({
      id: `${src}-case`, type: 'line', source: src,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff',
               'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 12, 9],
               'line-opacity': 0.55 }
    });

    /* Coloured route */
    _map.addLayer({
      id: src, type: 'line', source: src,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': DAY_COLORS[dayId] || '#888',
               'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 12, 6],
               'line-opacity': 0.9 }
    });

    /* Wide transparent hit area so the route is easy to click/tap */
    _map.addLayer({
      id: `${src}-hit`, type: 'line', source: src,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': 'transparent', 'line-width': 24, 'line-opacity': 0 }
    });
  }

  /* Upgrade each route to road-following geometry from OSRM (async) */
  upgradeRoutesToRoads();
}

/* Fetch road-following route geometry from OSRM, cache in localStorage */
async function getRoadRoute(dayId, waypoints) {
  const cacheKey = `rv-route-v2-${dayId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const coordStr = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (!data.routes?.[0]?.geometry?.coordinates) throw new Error('No route data');
  const coords = data.routes[0].geometry.coordinates;

  try { localStorage.setItem(cacheKey, JSON.stringify(coords)); } catch {}
  return coords;
}

/* Upgrade all route sources in parallel; keep straight-line fallback on error */
async function upgradeRoutesToRoads() {
  await Promise.allSettled(
    Object.entries(DAY_ROUTES).map(async ([dayId, waypoints]) => {
      try {
        const coords = await getRoadRoute(dayId, waypoints);
        if (!_map) return;
        const src = _map.getSource(`route-${dayId}`);
        if (src) src.setData(lineFeature(dayId, coords));
      } catch { /* silently keep straight-line fallback */ }
    })
  );
}

/* ── Route interactivity (call after days data is loaded) ────────────────── */
export function setupRouteClicks(days) {
  if (!_map) return;
  const dayMap    = Object.fromEntries(days.map(d => [d.id, d]));
  const dayIds    = Object.keys(DAY_ROUTES);
  const hitLayers = dayIds.map(d => `route-${d}-hit`);
  const lineLayers = dayIds.map(d => `route-${d}`);
  const allLayers  = [...hitLayers, ...lineLayers];

  /* Single map-level handler avoids duplicate popups on overlapping routes.
     queryRenderedFeatures returns features in render order (topmost first);
     we take the first hit so only one popup fires per click. */
  _map.on('click', e => {
    const features = _map.queryRenderedFeatures(e.point, { layers: allLayers });
    if (!features.length) return;

    /* Extract dayId from the layer id, e.g. "route-day3-hit" → "day3" */
    const layerId = features[0].layer.id;
    const match   = layerId.match(/^route-(day\d+)/);
    if (!match) return;
    const dayId = match[1];
    const day   = dayMap[dayId];
    if (!day) return;

    const color   = DAY_COLORS[dayId] || '#888';
    const dateStr = day.date
      ? new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    const stats = [
      day.driveTime     ? `🕐 ${day.driveTime}`        : null,
      day.distanceMiles ? `📍 ${day.distanceMiles} mi`  : null,
    ].filter(Boolean).join('&emsp;');

    new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'route-popup' })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2px 2px 4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
            <strong style="font-size:.95rem;color:#1a1a1a">Day ${day.order || ''}: ${esc(day.title || dayId)}</strong>
          </div>
          ${dateStr ? `<div style="font-size:.78rem;color:#888;margin-bottom:4px">${esc(dateStr)}</div>` : ''}
          ${stats    ? `<div style="font-size:.82rem;margin-bottom:6px">${stats}</div>` : ''}
          ${day.fromTo ? `<div style="font-size:.82rem;color:#555;margin-bottom:5px">📌 ${esc(day.fromTo)}</div>` : ''}
          ${day.summary ? `<div style="font-size:.82rem;color:#444;line-height:1.45;max-width:260px">${esc(day.summary)}</div>` : ''}
        </div>
      `)
      .addTo(_map);
  });

  /* Pointer cursor when hovering any route */
  for (const id of allLayers) {
    _map.on('mouseenter', id, () => { _map.getCanvas().style.cursor = 'pointer'; });
    _map.on('mouseleave', id, () => { _map.getCanvas().style.cursor = '';        });
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Route visibility toggle ─────────────────────────────────────────────── */
export function setRouteVisibility(dayIds) {
  if (!_map) return;
  for (const dayId of Object.keys(DAY_ROUTES)) {
    const vis = (!dayIds || dayIds.includes(dayId)) ? 'visible' : 'none';
    for (const suffix of ['', '-case', '-hit']) {
      const id = `route-${dayId}${suffix}`;
      if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', vis);
    }
  }
}

/* ── Camera helpers ──────────────────────────────────────────────────────── */
export function flyToPlace(lat, lng, zoom = 13) {
  if (!_map) return;
  _map.flyTo({ center: [lng, lat], zoom, speed: 1.4 });
}

export function fitToDay(dayId) {
  if (!_map || !DAY_ROUTES[dayId]) return;
  const coords = DAY_ROUTES[dayId];
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  _map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: { top: 60, bottom: 120, left: 20, right: 20 }, maxZoom: 11, duration: 800 }
  );
}

export function fitTrip() {
  if (!_map) return;
  _map.fitBounds([[-111.2, 39.6], [-104.4, 45.1]], {
    padding: { top: 60, bottom: 100, left: 16, right: 16 }, duration: 600
  });
}
