/* MapLibre + PMTiles initialisation and basemap style */

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

function buildMapStyle(pmtilesAbsoluteUrl) {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${pmtilesAbsoluteUrl}`,
        attribution: '© <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors · © <a href="https://protomaps.com" target="_blank">Protomaps</a>'
      }
    },
    layers: [
      { id: 'background',      type: 'background', paint: { 'background-color': '#f5efe0' } },

      /* Land */
      { id: 'earth',            type: 'fill',   source: 'basemap', 'source-layer': 'earth',
        paint: { 'fill-color': '#ecdec7' } },

      /* Water */
      { id: 'water',            type: 'fill',   source: 'basemap', 'source-layer': 'water',
        paint: { 'fill-color': '#9fc4d0' } },

      /* Natural (parks, forests) */
      { id: 'natural',          type: 'fill',   source: 'basemap', 'source-layer': 'natural',
        paint: { 'fill-color': '#c5d9aa', 'fill-opacity': 0.85 } },
      { id: 'landuse-park',     type: 'fill',   source: 'basemap', 'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['national_park', 'park', 'forest', 'nature_reserve']]],
        paint: { 'fill-color': '#b8d49a', 'fill-opacity': 0.7 } },
      { id: 'landuse-urban',    type: 'fill',   source: 'basemap', 'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'industrial']]],
        paint: { 'fill-color': '#e0d5c0', 'fill-opacity': 0.6 } },

      /* Admin boundaries */
      { id: 'boundaries',       type: 'line',   source: 'basemap', 'source-layer': 'boundaries',
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': '#b8a88a', 'line-width': 0.8, 'line-dasharray': [4, 3] } },

      /* Roads — minor (high zoom only) */
      { id: 'roads-minor',      type: 'line',   source: 'basemap', 'source-layer': 'roads',
        minzoom: 12,
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'service', 'track', 'path']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#e8ddc8', 'line-width': 1 } },

      /* Roads — secondary */
      { id: 'roads-secondary',  type: 'line',   source: 'basemap', 'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['secondary', 'tertiary']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 13, 3] } },

      /* Roads — major (casing) */
      { id: 'roads-major-case', type: 'line',   source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'major_road'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#c8b070',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 13, 7] } },
      { id: 'roads-major',      type: 'line',   source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'major_road'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f5e090',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 13, 5] } },

      /* Roads — highway (casing) */
      { id: 'roads-hw-case',    type: 'line',   source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#b08840',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 12, 10] } },
      { id: 'roads-highway',    type: 'line',   source: 'basemap', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f8d060',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 12, 7] } },

      /* Water lines */
      { id: 'waterway',         type: 'line',   source: 'basemap', 'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#9fc4d0', 'line-width': 1 } },
    ]
  };
}

/* ── Map instance ────────────────────────────────────────────────────────── */
let _map = null;

export function getMap() { return _map; }

export async function initMap(containerId) {
  const pmtilesUrl = new URL('./basemap.pmtiles', location.href).href;

  /* Register PMTiles protocol */
  const p = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', p.tile.bind(p));

  _map = new maplibregl.Map({
    container: containerId,
    style: buildMapStyle(pmtilesUrl),
    center: [-107.8, 43.2],
    zoom: 5.5,
    minZoom: 4,
    maxZoom: 17,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false
  });

  _map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  return new Promise((resolve, reject) => {
    _map.on('load', () => {
      addRouteLayer();
      resolve(_map);
    });
    _map.on('error', e => {
      /* Basemap tile errors are non-fatal (file might not exist yet) */
      if (!e.error?.message?.includes('pmtiles')) reject(e.error);
    });
  });
}

/* ── Route layers ────────────────────────────────────────────────────────── */
function addRouteLayer() {
  if (!_map) return;

  for (const [dayId, coords] of Object.entries(DAY_ROUTES)) {
    const sourceId = `route-${dayId}`;
    _map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: { dayId },
        geometry: { type: 'LineString', coordinates: coords }
      }
    });

    /* Casing */
    _map.addLayer({
      id: `${sourceId}-case`,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 12, 8],
        'line-opacity': 0.6
      }
    });

    /* Route line */
    _map.addLayer({
      id: sourceId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': DAY_COLORS[dayId] || '#888',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 12, 5],
        'line-opacity': 0.9
      }
    });
  }
}

/* Show/hide route for specific days (pass null to show all) */
export function setRouteVisibility(dayIds) {
  if (!_map) return;
  for (const dayId of Object.keys(DAY_ROUTES)) {
    const vis = (!dayIds || dayIds.includes(dayId)) ? 'visible' : 'none';
    if (_map.getLayer(`route-${dayId}`))      _map.setLayoutProperty(`route-${dayId}`,      'visibility', vis);
    if (_map.getLayer(`route-${dayId}-case`)) _map.setLayoutProperty(`route-${dayId}-case`, 'visibility', vis);
  }
}

/* Fly to a place */
export function flyToPlace(lat, lng, zoom = 13) {
  if (!_map) return;
  _map.flyTo({ center: [lng, lat], zoom, speed: 1.4 });
}

/* Fit to a day's route bbox */
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

/* Fit entire trip */
export function fitTrip() {
  if (!_map) return;
  _map.fitBounds([[-111.2, 39.6], [-104.4, 45.1]], {
    padding: { top: 60, bottom: 100, left: 16, right: 16 }, duration: 600
  });
}
