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
    [-104.9880, 39.9519], // Thornton
    [-105.0752, 40.5853], // Fort Collins
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
    [-109.0732, 44.5250], // Cody
    [-109.1856, 44.5063], // Buffalo Bill Dam
    [-109.9000, 44.4890], // East Entrance approach
    [-110.3695, 44.5648], // Fishing Bridge
  ],
  day3: [
    [-110.3695, 44.5648], // Fishing Bridge
    [-110.4337, 44.6249], // Mud Volcano
    [-110.4686, 44.6597], // Hayden Valley
    [-110.4925, 44.7355], // Canyon Village
    [-110.4794, 44.7210], // Artist Point
    [-110.4925, 44.7355], // Canyon (back)
    [-110.4686, 44.6597], // Hayden Valley
    [-110.3695, 44.5648], // Fishing Bridge
  ],
  day4: [
    [-110.3695, 44.5648], // Fishing Bridge
    [-110.5729, 44.4163], // West Thumb
    [-110.8281, 44.4605], // Old Faithful
    [-110.8382, 44.5251], // Grand Prismatic
    [-110.8669, 44.5563], // Firehole Canyon
    [-110.8636, 44.6433], // Madison CG
  ],
  day5: [
    [-110.8636, 44.6433], // Madison
    [-110.7716, 44.6519], // Gibbon Falls
    [-110.7036, 44.7263], // Norris
    [-110.4925, 44.7355], // Canyon Village
    [-110.3695, 44.5648], // Fishing Bridge
    [-109.9000, 44.4890], // East Entrance
    [-109.0732, 44.5250], // Cody
    [-109.0853, 44.5213], // Cody Rodeo
    [-109.0942, 44.5148], // Parkway RV
  ],
  day6: [
    [-109.0942, 44.5148], // Parkway RV Cody
    [-109.0732, 44.5250], // Cody
    [-108.0533, 44.4861], // Greybull
    [-107.9567, 44.0166], // Worland
    [-108.2058, 43.6511], // Thermopolis
    [-108.1010, 43.2336], // Shoshoni
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

function buildMapStyle(pmtilesAbsoluteUrl, glyphsBase) {
  return {
    version: 8,
    /* Self-hosted glyphs (downloaded at build time, precached by SW) */
    glyphs: `${glyphsBase}{fontstack}/{range}.pbf`,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${pmtilesAbsoluteUrl}`,
        attribution: '© <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a> · © <a href="https://protomaps.com" target="_blank">Protomaps</a>'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f5efe0' } },

      /* Land */
      { id: 'earth',         type: 'fill', source: 'basemap', 'source-layer': 'earth',
        paint: { 'fill-color': '#ecdec7' } },

      /* Water */
      { id: 'water',         type: 'fill', source: 'basemap', 'source-layer': 'water',
        paint: { 'fill-color': '#9fc4d0' } },

      /* Natural (parks, forests) */
      { id: 'natural',       type: 'fill', source: 'basemap', 'source-layer': 'natural',
        paint: { 'fill-color': '#c5d9aa', 'fill-opacity': 0.85 } },
      { id: 'landuse-park',  type: 'fill', source: 'basemap', 'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['national_park','park','forest','nature_reserve']]],
        paint: { 'fill-color': '#b8d49a', 'fill-opacity': 0.7 } },
      { id: 'landuse-urban', type: 'fill', source: 'basemap', 'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['residential','commercial','industrial']]],
        paint: { 'fill-color': '#e0d5c0', 'fill-opacity': 0.6 } },

      /* Admin boundaries */
      { id: 'boundaries',    type: 'line', source: 'basemap', 'source-layer': 'boundaries',
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': '#b8a88a', 'line-width': 0.8, 'line-dasharray': [4, 3] } },

      /* Roads — minor */
      { id: 'roads-minor',     type: 'line', source: 'basemap', 'source-layer': 'roads',
        minzoom: 12,
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road','service','track','path']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#e8ddc8', 'line-width': 1 } },

      /* Roads — secondary */
      { id: 'roads-secondary', type: 'line', source: 'basemap', 'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['secondary','tertiary']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 13, 3] } },

      /* Roads — major (casing then fill) */
      { id: 'roads-major-case', type: 'line', source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'major_road'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#c8b070',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 13, 7] } },
      { id: 'roads-major',      type: 'line', source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'major_road'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f5e090',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 13, 5] } },

      /* Roads — highway (casing then fill) */
      { id: 'roads-hw-case', type: 'line', source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#b08840',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 12, 10] } },
      { id: 'roads-highway',  type: 'line', source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f8d060',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 12, 7] } },

      /* Water lines */
      { id: 'waterway', type: 'line', source: 'basemap', 'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#9fc4d0', 'line-width': 1 } },

      /* ── Text labels ──────────────────────────────────────────────────── */

      /* Road names (along line, high zoom only) */
      { id: 'label-roads-major', type: 'symbol', source: 'basemap', 'source-layer': 'roads',
        minzoom: 11,
        filter: ['in', ['get', 'kind'], ['literal', ['highway','major_road']]],
        layout: {
          'text-field': ['coalesce', ['get', 'ref'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'symbol-placement': 'line',
          'text-max-angle': 30,
          'text-pitch-alignment': 'viewport',
        },
        paint: {
          'text-color': '#5a4020',
          'text-halo-color': 'rgba(255,255,255,0.85)',
          'text-halo-width': 1.5,
        } },

      /* Place labels — villages and hamlets (zoom 10+) */
      { id: 'label-places-small', type: 'symbol', source: 'basemap', 'source-layer': 'places',
        minzoom: 10,
        filter: ['in', ['get', 'kind'], ['literal', ['village','hamlet','suburb','neighbourhood']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-max-width': 8,
          'symbol-sort-key': 3,
          'icon-allow-overlap': false,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#3a3020',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 1.5,
        } },

      /* Place labels — towns (zoom 8+) */
      { id: 'label-places-town', type: 'symbol', source: 'basemap', 'source-layer': 'places',
        minzoom: 8,
        filter: ['==', ['get', 'kind'], 'town'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 14],
          'text-anchor': 'center',
          'text-max-width': 8,
          'symbol-sort-key': 2,
        },
        paint: {
          'text-color': '#3a3020',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 2,
        } },

      /* Place labels — cities (zoom 5+) */
      { id: 'label-places-city', type: 'symbol', source: 'basemap', 'source-layer': 'places',
        minzoom: 5,
        filter: ['in', ['get', 'kind'], ['literal', ['city','state_capital','national_capital']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 15, 12, 18],
          'text-anchor': 'center',
          'text-max-width': 8,
          'symbol-sort-key': 1,
        },
        paint: {
          'text-color': '#2a2010',
          'text-halo-color': 'rgba(255,255,255,0.95)',
          'text-halo-width': 2.5,
        } },

      /* State / region labels */
      { id: 'label-states', type: 'symbol', source: 'basemap', 'source-layer': 'places',
        minzoom: 4, maxzoom: 7,
        filter: ['==', ['get', 'kind'], 'state'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 7, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 6,
        },
        paint: {
          'text-color': '#7a6840',
          'text-halo-color': 'rgba(255,255,255,0.8)',
          'text-halo-width': 1.5,
        } },
    ]
  };
}

/* ── Map instance ────────────────────────────────────────────────────────── */
let _map = null;

export function getMap() { return _map; }

export async function initMap(containerId) {
  const pmtilesUrl  = new URL('./basemap.pmtiles', location.href).href;
  const glyphsBase  = new URL('./glyphs/', location.href).href;

  const p = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', p.tile.bind(p));

  _map = new maplibregl.Map({
    container: containerId,
    style: buildMapStyle(pmtilesUrl, glyphsBase),
    center: [-107.8, 43.2],
    zoom: 5.5,
    minZoom: 4,
    maxZoom: 17,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false,
  });

  _map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  return new Promise((resolve, reject) => {
    _map.on('load', () => { addRouteLayers(); resolve(_map); });
    _map.on('error', e => {
      if (!e.error?.message?.includes('pmtiles')) reject(e.error);
    });
  });
}

/* ── Route layers ────────────────────────────────────────────────────────── */
function addRouteLayers() {
  if (!_map) return;
  for (const [dayId, coords] of Object.entries(DAY_ROUTES)) {
    const src = `route-${dayId}`;
    _map.addSource(src, {
      type: 'geojson',
      data: { type: 'Feature', properties: { dayId }, geometry: { type: 'LineString', coordinates: coords } }
    });

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
}

/* ── Route interactivity (call after days data is loaded) ────────────────── */
export function setupRouteClicks(days) {
  if (!_map) return;
  const dayMap = Object.fromEntries(days.map(d => [d.id, d]));

  for (const dayId of Object.keys(DAY_ROUTES)) {
    const src    = `route-${dayId}`;
    const hitId  = `${src}-hit`;
    const color  = DAY_COLORS[dayId] || '#888';

    const showPopup = (e) => {
      const day = dayMap[dayId];
      if (!day) return;

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
              <strong style="font-size:.95rem;color:#1a1a1a">${esc(day.title || dayId)}</strong>
            </div>
            ${dateStr ? `<div style="font-size:.78rem;color:#888;margin-bottom:4px">${esc(dateStr)}</div>` : ''}
            ${stats    ? `<div style="font-size:.82rem;margin-bottom:6px">${stats}</div>` : ''}
            ${day.fromTo ? `<div style="font-size:.82rem;color:#555;margin-bottom:5px">📌 ${esc(day.fromTo)}</div>` : ''}
            ${day.summary ? `<div style="font-size:.82rem;color:#444;line-height:1.45;max-width:260px">${esc(day.summary)}</div>` : ''}
          </div>
        `)
        .addTo(_map);
    };

    _map.on('click', src,   showPopup);
    _map.on('click', hitId, showPopup);

    /* Pointer cursor on hover — on desktop */
    for (const id of [src, hitId]) {
      _map.on('mouseenter', id, () => { _map.getCanvas().style.cursor = 'pointer'; });
      _map.on('mouseleave', id, () => { _map.getCanvas().style.cursor = '';        });
    }
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
