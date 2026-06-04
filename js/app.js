/* Main app orchestrator */

import { openDB, isEmpty, replaceAll, getTripMeta, getAllDays, getAllPlaces, getStorageEstimate } from './db.js';
import { initMap, fitTrip, flyToPlace, setupRouteClicks, toggleSatellite } from './map-init.js';
import { renderMarkers, toggleFilter, getActiveFilters, closeBottomSheet, updateGpsMarker, renderDayLegend } from './markers.js';
import { initItinerary, updateItinerary } from './ui-itinerary.js';
import { initImport } from './ui-import.js';
import { startWatching, onPositionUpdate } from './gps.js';

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
    const bookingEl = document.getElementById('trip-booking-meta');
    if (bookingEl) bookingEl.textContent = meta.booking || '';
  }
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

  /* Seed IndexedDB from trip.json if empty */
  if (await isEmpty()) {
    setLoadingStatus('Loading trip data…');
    try {
      const res  = await fetch('./trip.json');
      const doc  = await res.json();
      await replaceAll(doc.trip, doc.days || [], doc.places || []);
    } catch (e) {
      console.error('Failed to seed from trip.json:', e);
    }
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
}

/* ── Start ─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', boot);
