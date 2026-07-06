/* Main app orchestrator */

import { openDB, isEmpty, replaceAll, getTripMeta, getAllDays, getAllPlaces, getStorageEstimate } from './db.js';
import { initMap, fitTrip, flyToPlace, setupRouteClicks, toggleSatellite } from './map-init.js';
import { renderMarkers, toggleFilter, getActiveFilters, toggleOptionalStops, closeBottomSheet, updateGpsMarker, renderDayLegend } from './markers.js';
import { initItinerary, updateItinerary } from './ui-itinerary.js';
import { initImport } from './ui-import.js';
import { startWatching, onPositionUpdate } from './gps.js';
import { tilesAlreadyCached, preCacheMapTiles, countTiles, resetTileCache } from './tile-precache.js';

/* ── Toast ──────────────────────────────────────────────────────────────── */
let _toastTimer = null;
export function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── Service Worker registration ────────────────────────────────────────── */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    navigator.serviceWorker.addEventListener('message', event => {
      const { type, progress, status } = event.data || {};
      if (type === 'precache-progress') {
        setLoadingStatus(status || '');
        setLoadingProgress(progress || 0);
      }
      if (type === 'precache-done') {
        setLoadingProgress(100);
      }
    });

    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('App updated — refresh to get latest version', 5000);
        }
      });
    });
  } catch (e) {
    console.warn('SW registration failed:', e);
  }
}

/* ── Online / offline indicator ─────────────────────────────────────────── */
function updateStatusPill() {
  const pill = document.getElementById('status-pill');
  const online = navigator.onLine;
  pill.textContent = online ? 'Online' : 'Offline';
  pill.className   = `status-pill ${online ? 'online' : 'offline'}`;
}

/* ── Loading overlay ────────────────────────────────────────────────────── */
function setLoadingStatus(msg) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}
function setLoadingProgress(pct) {
  const bar = document.querySelector('.progress-fill');
  if (bar) bar.style.width = `${Math.min(100, pct)}%`;
}
function hideLoading() {
  const ld = document.getElementById('loading');
  if (ld) {
    ld.classList.add('hidden');
    setTimeout(() => ld.remove(), 500);
  }
}

/* ── Tab navigation ─────────────────────────────────────────────────────── */
const TABS = ['map', 'itinerary', 'info', 'import'];
let _activeTab = 'map';

function switchTab(tabId) {
  if (!TABS.includes(tabId)) return;
  _activeTab = tabId;

  TABS.forEach(t => {
    document.getElementById(`panel-${t}`)?.classList.toggle('active', t === tabId);
    document.querySelector(`[data-tab="${t}"]`)?.classList.toggle('active', t === tabId);
  });

  if (tabId === 'map') {
    /* Force map resize on tab switch */
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }
  if (tabId === 'info') {
    updateInfoPanel();
  }
}

/* ── Info panel ─────────────────────────────────────────────────────────── */
async function updateInfoPanel() {
  const est = await getStorageEstimate();
  const storageEl = document.getElementById('storage-info');
  if (storageEl && est) {
    storageEl.textContent = `Storage used: ~${est.usageMB} MB of ~${est.quotaMB} MB available`;
  }
  const meta = await getTripMeta();
  if (meta) {
    const titleEl = document.getElementById('trip-title-meta');
    if (titleEl) titleEl.textContent = meta.title || '';
    const vehicleEl = document.getElementById('trip-vehicle-meta');
    if (vehicleEl) vehicleEl.textContent = meta.vehicle || '';
  }
  updateTileCacheStatus();
}

function updateTileCacheStatus() {
  const statusEl = document.getElementById('tile-cache-status');
  if (!statusEl) return;
  if (tilesAlreadyCached()) {
    statusEl.textContent = '✅ Offline maps cached';
    statusEl.className = 'tile-cache-status cached';
  } else {
    const n = countTiles().toLocaleString();
    statusEl.textContent = `⬇️ ~${n} tiles not yet cached`;
    statusEl.className = 'tile-cache-status not-cached';
  }
}

let _precaching = false;

async function startManualPrecache() {
  if (_precaching) return;
  _precaching = true;

  const btn = document.getElementById('tile-cache-btn');
  const bar = document.getElementById('tile-cache-bar');
  const fill = document.getElementById('tile-cache-fill');
  const statusEl = document.getElementById('tile-cache-status');

  if (btn) btn.disabled = true;
  if (bar) bar.style.display = 'block';

  showToast('📥 Downloading offline maps… this may take a few minutes', 8000);

  try {
    const stats = await preCacheMapTiles((pct, done, total, sourceId) => {
      if (fill) fill.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = `📥 ${pct}% — caching ${sourceId} tiles…`;
    });
    updateTileCacheStatus();
    if (bar) bar.style.display = 'none';
    if (stats.quotaHit) {
      showToast('⚠️ Storage full — install as PWA (Add to Home Screen) for more space', 7000);
      if (statusEl) statusEl.textContent = `⚠️ Storage quota reached — ${(stats.ok + stats.skipped).toLocaleString()} tiles saved`;
    } else {
      showToast(`✅ Offline maps saved! (${stats.ok.toLocaleString()} new tiles)`, 4000);
    }
  } catch (e) {
    showToast('⚠️ Map caching failed — try again online', 4000);
  }

  if (btn) btn.disabled = false;
  _precaching = false;
}

/* ── Filter chips ───────────────────────────────────────────────────────── */
function initFilterChips() {
  const chips = document.querySelectorAll('[data-filter]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.filter;
      toggleFilter(cat);
      const active = getActiveFilters();
      chip.classList.toggle('active', active.has(cat));
    });
  });

  /* Optional stops toggle */
  const optChip = document.getElementById('optional-stops-chip');
  if (optChip) {
    optChip.addEventListener('click', () => {
      const nowVisible = toggleOptionalStops();
      optChip.classList.toggle('active', nowVisible);
      optChip.setAttribute('aria-pressed', String(nowVisible));
    });
  }
}


/* ── Data load & refresh ────────────────────────────────────────────────── */
async function loadData() {
  const [days, places] = await Promise.all([getAllDays(), getAllPlaces()]);
  return { days, places };
}

async function refreshUI() {
  const { days, places } = await loadData();
  renderMarkers(places, days);
  updateItinerary(days, places);
  renderDayLegend(days);
}

/* ── Boot sequence ──────────────────────────────────────────────────────── */
async function boot() {
  await registerSW();
  await openDB();

  /* Seed IndexedDB from trip.json if empty OR if the bundled data has changed.
     The trip.json label is stored in localStorage so we can detect updates
     without requiring users to manually reset. */
  const TRIP_LABEL_KEY = 'rv-trip-data-label';
  try {
    setLoadingStatus('Checking trip data…');
    const res    = await fetch('./trip.json');
    const doc    = await res.json();
    const stored = localStorage.getItem(TRIP_LABEL_KEY);
    if (await isEmpty() || stored !== doc.label) {
      setLoadingStatus('Loading updated trip data…');
      await replaceAll(doc.trip, doc.days || [], doc.places || []);
      localStorage.setItem(TRIP_LABEL_KEY, doc.label || '');
    }
  } catch (e) {
    console.error('Failed to seed from trip.json:', e);
  }

  /* Online/offline status */
  updateStatusPill();
  window.addEventListener('online',  updateStatusPill);
  window.addEventListener('offline', updateStatusPill);

  /* Load stored data */
  setLoadingStatus('Loading itinerary…');
  const { days, places } = await loadData();

  /* Init map */
  setLoadingStatus('Initialising map…');
  setLoadingProgress(40);
  try {
    await initMap('map');
    setLoadingProgress(70);
  } catch (e) {
    console.warn('Map init error:', e);
  }

  /* Render markers & routes */
  setLoadingStatus('Placing markers…');
  renderMarkers(places, days);
  renderDayLegend(days);
  setupRouteClicks(days);
  fitTrip();
  setLoadingProgress(85);

  /* Init itinerary */
  initItinerary(days, places, () => switchTab('map'));

  /* Init import/export */
  initImport(async () => { await refreshUI(); }, showToast);

  /* GPS watching */
  startWatching();
  onPositionUpdate(pos => updateGpsMarker(pos.lat, pos.lng));

  /* Tab navigation */
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* Filter chips */
  initFilterChips();

  /* Bottom sheet close on map tap */
  document.getElementById('map')?.addEventListener('click', e => {
    if (!e.target.closest('.map-marker')) closeBottomSheet();
  });

  /* Satellite toggle button */
  document.getElementById('sat-btn')?.addEventListener('click', () => {
    const btn  = document.getElementById('sat-btn');
    const isOn = toggleSatellite();
    btn.classList.toggle('active', isOn);
    btn.setAttribute('aria-pressed', String(isOn));
    showToast(isOn ? '🛰️ Satellite — browse to cache tiles offline' : '🗺️ Map view');
  });

  /* Fit-trip button */
  document.getElementById('fit-btn')?.addEventListener('click', fitTrip);

  /* Offline maps cache button */
  document.getElementById('tile-cache-btn')?.addEventListener('click', startManualPrecache);
  document.getElementById('tile-cache-reset-btn')?.addEventListener('click', () => {
    resetTileCache();
    updateTileCacheStatus();
    showToast('🗑️ Cache flag cleared — tap Download to re-cache');
  });

  /* Locate-me button */
  document.getElementById('locate-btn')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        updateGpsMarker(lat, lng);
        flyToPlace(lat, lng, 12);
        showToast('Located!');
      }, () => showToast('Location unavailable — check Safari settings'));
    } else {
      showToast('Geolocation not supported');
    }
  });

  /* Activate map tab first */
  switchTab('map');
  setLoadingProgress(100);

  /* Show app */
  setLoadingStatus('Ready!');
  setTimeout(hideLoading, 300);

  /* Auto-precache map tiles on first open (runs in background after UI shown) */
  if (!tilesAlreadyCached() && navigator.onLine) {
    setTimeout(() => startManualPrecache(), 3000);
  }
}

/* ── Start ─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', boot);
