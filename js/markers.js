/* Marker management — creates MapLibre HTML markers and handles bottom-sheet */

import { getMap, DAY_COLORS, flyToPlace, setRouteVisibility } from './map-init.js';
import { getDistanceEta, formatDistance } from './gps.js';

const CATEGORY_EMOJI = {
  'Sights':        '🏔️',
  'Wildlife':      '🦬',
  'History':       '🏛️',
  'Food/Brewery':  '🍺',
  'Outdoors':      '🌲',
  'Fuel/Services': '⛽',
  'Lodging':       '🏕️',
};

const KIND_EMOJI = {
  campground: '🏕️',
  stop:       '📍',
  poi:        '⭐',
};

/* Active filters — set of category names that are ON; campground/stop always on */
const _activeFilters = new Set(['Sights', 'Wildlife', 'History', 'Food/Brewery', 'Outdoors', 'Fuel/Services', 'Lodging', 'campground', 'stop']);
let _markers = [];           // { marker, place, el }
let _currentDayFilter = null;  // null = all days
let _showOptional = false;     // POIs with no dayIds hidden by default

/* ── Marker element factory ──────────────────────────────────────────────── */
function makeMarkerEl(place, days) {
  /* MapLibre adds class .maplibregl-marker { position:absolute; top:0; left:0 }
     to whatever element we pass in.  Don't set position inline — it would
     override that CSS and break transform-based positioning entirely. */
  const wrapper = document.createElement('div');
  wrapper.className = 'map-marker';
  wrapper.style.cssText = 'width:32px;height:32px;cursor:pointer;position:relative';

  const dayIds = Array.isArray(place.dayIds) ? place.dayIds : [];
  const primaryDay = dayIds[0] || null;
  const dayColor = primaryDay ? (DAY_COLORS[primaryDay] || '#888') : null;

  const inner = document.createElement('div');
  inner.style.cssText = [
    'width:32px', 'height:32px',
    'display:flex', 'align-items:center', 'justify-content:center',
    'border-radius:50%', 'border:2px solid rgba(255,255,255,.85)',
    'box-shadow:0 2px 6px rgba(0,0,0,.3)',
    'font-size:16px', 'line-height:1',
    'transition:transform .15s, box-shadow .15s',
    'user-select:none', '-webkit-user-select:none',
  ].join(';');

  let bg, text;
  if (place.kind === 'campground') {
    bg = dayColor || '#2d5a27'; text = '🏕️';
  } else if (place.kind === 'stop') {
    bg = dayColor || '#8b5e3c'; text = '📍';
  } else {
    bg = dayColor || '#3a5a8c';
    text = CATEGORY_EMOJI[place.category] || '⭐';
  }

  inner.style.background = bg;
  inner.textContent = text;

  inner.addEventListener('mouseenter', () => {
    inner.style.transform = 'scale(1.2) translateY(-2px)';
    inner.style.boxShadow = '0 4px 12px rgba(0,0,0,.4)';
  });
  inner.addEventListener('mouseleave', () => {
    inner.style.transform = '';
    inner.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  });

  wrapper.appendChild(inner);

  /* Day badge — shows day number(s), e.g. "1" or "1·5" for multi-day */
  if (dayIds.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'day-badge';
    const nums = dayIds.map(id => {
      const d = days ? days.find(x => x.id === id) : null;
      return d ? String(d.order) : id.replace('day', '');
    });
    badge.textContent = nums.slice(0, 2).join('·');
    badge.style.background = dayColor || '#888';
    wrapper.appendChild(badge);
  }

  return wrapper;
}

/* ── Render all markers ──────────────────────────────────────────────────── */
export function renderMarkers(places, days) {
  const map = getMap();
  if (!map) return;

  /* Build day-title lookup */
  const dayMap = Object.fromEntries((days || []).map(d => [d.id, d]));

  /* Remove existing markers */
  _markers.forEach(m => m.marker.remove());
  _markers = [];

  for (const place of places) {
    if (typeof place.lat !== 'number' || typeof place.lng !== 'number') continue;

    const el = makeMarkerEl(place, days);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([place.lng, place.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showBottomSheet(place, dayMap);
    });

    _markers.push({ marker, place, el, visible: true });
  }

  applyFilters();
}

/* ── Filter chips logic ──────────────────────────────────────────────────── */
export function toggleFilter(category) {
  if (_activeFilters.has(category)) _activeFilters.delete(category);
  else _activeFilters.add(category);
  applyFilters();
}

export function setDayFilter(dayId) {
  _currentDayFilter = dayId;
  if (dayId) setRouteVisibility([dayId]);
  else setRouteVisibility(null);
  applyFilters();
}

export function toggleOptionalStops() {
  _showOptional = !_showOptional;
  applyFilters();
  return _showOptional;
}

export function isOptionalStopsVisible() { return _showOptional; }

function applyFilters() {
  for (const m of _markers) {
    const p = m.place;
    let show = true;

    /* Category / kind filter */
    if (p.kind === 'campground' && !_activeFilters.has('campground')) show = false;
    else if (p.kind === 'stop'  && !_activeFilters.has('stop'))       show = false;
    else if (p.kind === 'poi'   && !_activeFilters.has(p.category))   show = false;

    /* Optional stops (POIs with no dayIds) */
    if (show && p.kind === 'poi') {
      const hasScheduledDays = Array.isArray(p.dayIds) && p.dayIds.length > 0;
      if (!hasScheduledDays && !_showOptional) show = false;
    }

    /* Day filter */
    if (show && _currentDayFilter) {
      const dayIds = Array.isArray(p.dayIds) ? p.dayIds : [];
      if (!dayIds.includes(_currentDayFilter)) show = false;
    }

    m.el.style.display = show ? '' : 'none';
    m.visible = show;
  }
}

export function getActiveFilters() { return _activeFilters; }

/* ── Bottom sheet ────────────────────────────────────────────────────────── */
let _bsPlace = null;
let _bsEtaLoading = false;

export function showBottomSheet(place, dayMap) {
  _bsPlace = place;

  const sheet = document.getElementById('bottom-sheet');
  const body  = document.getElementById('bs-body');

  /* Kind badge */
  const badge = document.getElementById('bs-kind-badge');
  badge.textContent = place.kind === 'campground' ? 'Campground'
    : place.kind === 'stop' ? 'Stop'
    : (place.category || 'POI');
  badge.className = `badge-${place.kind}`;

  document.getElementById('bs-name').textContent  = place.name;

  /* Days */
  const daysEl = document.getElementById('bs-days');
  if (Array.isArray(place.dayIds) && place.dayIds.length) {
    daysEl.textContent = place.dayIds.map(id => dayMap[id]?.title || id).join(' · ');
    daysEl.style.display = '';
  } else {
    daysEl.style.display = 'none';
  }

  document.getElementById('bs-notes').textContent   = place.notes || '';
  document.getElementById('bs-address').textContent = place.address || '';
  document.getElementById('bs-address').style.display = place.address ? '' : 'none';

  /* Actions */
  renderBsActions(place);

  /* GPS result reset */
  const gpsResult = document.getElementById('bs-gps-result');
  gpsResult.classList.remove('visible');

  sheet.classList.add('open');
  /* Pan gently to the marker if it's near the edge, but don't force zoom */
  flyToPlace(place.lat, place.lng, getMap()?.getZoom() ?? 10);
}

function renderBsActions(place) {
  const container = document.querySelector('.bs-actions');
  container.innerHTML = '';

  /* ETA button */
  const etaBtn = document.createElement('button');
  etaBtn.className = 'action-btn btn-primary';
  etaBtn.innerHTML = '<span class="action-icon">📍</span> Distance & ETA from me';
  etaBtn.addEventListener('click', handleEta);
  container.appendChild(etaBtn);

  /* Apple Maps / Google Maps */
  const appleUrl  = `maps://?daddr=${place.lat},${place.lng}`;
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  const mapsBtn = document.createElement('a');
  mapsBtn.className = 'action-btn btn-secondary';
  mapsBtn.href = appleUrl;
  mapsBtn.innerHTML = '<span class="action-icon">🗺️</span> Open in Maps';
  container.appendChild(mapsBtn);

  /* Google Maps fallback (separate button) */
  const gBtn = document.createElement('a');
  gBtn.className = 'action-btn btn-outline';
  gBtn.href = googleUrl;
  gBtn.target = '_blank';
  gBtn.rel = 'noopener';
  gBtn.innerHTML = '<span class="action-icon">🌐</span> Open in Google Maps';
  container.appendChild(gBtn);

  /* Phone */
  if (place.phone) {
    const telBtn = document.createElement('a');
    telBtn.className = 'action-btn btn-tel';
    telBtn.href = `tel:${place.phone}`;
    const display = place.phone.replace(/^\+1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    telBtn.innerHTML = `<span class="action-icon">📞</span> ${display}`;
    container.appendChild(telBtn);
  }

  /* Website */
  if (place.website && place.website.startsWith('https://')) {
    const webBtn = document.createElement('a');
    webBtn.className = 'action-btn btn-outline';
    webBtn.href = place.website;
    webBtn.target = '_blank';
    webBtn.rel = 'noopener';
    webBtn.innerHTML = '<span class="action-icon">🌐</span> Website';
    container.appendChild(webBtn);
  }
}

async function handleEta() {
  if (_bsEtaLoading || !_bsPlace) return;
  _bsEtaLoading = true;

  const gpsResult = document.getElementById('bs-gps-result');
  const gpsText   = document.getElementById('bs-gps-text');
  const gpsLabel  = document.getElementById('bs-gps-label');

  gpsText.textContent  = 'Getting location…';
  gpsLabel.textContent = '';
  gpsResult.classList.add('visible');

  try {
    const result = await getDistanceEta(_bsPlace.lat, _bsPlace.lng);
    if (!result) {
      gpsText.textContent  = 'Location unavailable';
      gpsLabel.textContent = 'Enable location in Settings → Safari';
    } else {
      const { mi, time } = formatDistance(result);
      gpsText.textContent  = `${mi} mi · ${time}`;
      gpsLabel.textContent = result.offline
        ? '⚠️ Approx. offline estimate (haversine × 1.25 road factor)'
        : `✓ Live route via OSRM · Accuracy: ±${Math.round(result.acc || 0)} m`;
    }
  } catch (e) {
    gpsText.textContent  = 'Location error';
    gpsLabel.textContent = e.message || 'Check location permissions';
  }

  _bsEtaLoading = false;
}

export function closeBottomSheet() {
  document.getElementById('bottom-sheet').classList.remove('open');
  _bsPlace = null;
}

/* ── GPS marker (blue dot) ───────────────────────────────────────────────── */
let _gpsMarker = null;

export function updateGpsMarker(lat, lng) {
  const map = getMap();
  if (!map) return;

  if (!_gpsMarker) {
    const el = document.createElement('div');
    el.style.cssText = [
      'width:16px','height:16px','background:#3a8cff',
      'border:3px solid #fff','border-radius:50%',
      'box-shadow:0 0 0 3px rgba(58,140,255,.3)',
    ].join(';');
    _gpsMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
  } else {
    _gpsMarker.setLngLat([lng, lat]);
  }
}

/* ── Day legend ──────────────────────────────────────────────────────────── */
const _hiddenDays = new Set();   /* day IDs whose routes are currently hidden */

export function renderDayLegend(days) {
  const legend = document.getElementById('day-legend');
  legend.innerHTML = '';

  for (const day of days) {
    const color = DAY_COLORS[day.id] || '#888';
    const row = document.createElement('div');
    row.className = 'legend-row legend-toggle';
    if (_hiddenDays.has(day.id)) row.classList.add('legend-off');
    row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>
                     <span class="legend-label">${day.title || day.id}</span>
                     <span class="legend-eye">${_hiddenDays.has(day.id) ? '👁️‍🗨️' : '👁️'}</span>`;

    row.addEventListener('click', () => {
      const isHidden = _hiddenDays.has(day.id);
      if (isHidden) {
        _hiddenDays.delete(day.id);
        row.classList.remove('legend-off');
        row.querySelector('.legend-eye').textContent = '👁️';
      } else {
        _hiddenDays.add(day.id);
        row.classList.add('legend-off');
        row.querySelector('.legend-eye').textContent = '👁️‍🗨️';
      }
      /* Show all days that are NOT hidden */
      const visible = days.map(d => d.id).filter(id => !_hiddenDays.has(id));
      setRouteVisibility(visible);
    });

    legend.appendChild(row);
  }
  legend.classList.add('visible');
}
