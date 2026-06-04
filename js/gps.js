/* GPS, haversine distance, OSRM routing */

const EARTH_KM = 6371;
const ROAD_FACTOR = 1.25;
const MPH_HIGHWAY = 55;
const MPH_PARK = 35;

/* Is a coordinate inside Yellowstone's rough bbox? */
function inYellowstone(lat, lng) {
  return lat >= 44.1 && lat <= 45.1 && lng >= -111.2 && lng <= -109.8;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2)**2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function offlineEstimate(userLat, userLng, destLat, destLng) {
  const straightKm = haversineKm(userLat, userLng, destLat, destLng);
  const roadKm     = straightKm * ROAD_FACTOR;
  const roadMi     = roadKm * 0.621371;
  const mph        = inYellowstone(destLat, destLng) ? MPH_PARK : MPH_HIGHWAY;
  const hours      = roadMi / mph;
  return { km: roadKm, miles: roadMi, hours, offline: true };
}

let _osrmThrottle = 0;
const OSRM_COOLDOWN = 5000;

export async function getOsrmRoute(userLat, userLng, destLat, destLng) {
  const now = Date.now();
  if (now - _osrmThrottle < OSRM_COOLDOWN) return null;
  _osrmThrottle = now;

  const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${destLng},${destLat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || !data.routes[0]) return null;
    const route = data.routes[0];
    const meters = route.distance;
    const seconds = route.duration;
    return { km: meters / 1000, miles: meters / 1609.34, hours: seconds / 3600, offline: false };
  } catch {
    return null;
  }
}

export function formatDistance(result) {
  const mi  = result.miles.toFixed(1);
  const hrs = Math.floor(result.hours);
  const min = Math.round((result.hours - hrs) * 60);
  let time;
  if (hrs === 0)      time = `${min} min`;
  else if (min === 0) time = `${hrs} hr`;
  else                time = `${hrs} hr ${min} min`;
  return { mi, time };
}

/* ── Geolocation ─────────────────────────────────────────────────────────── */
let _watchId = null;
let _lastPos = null;
const _listeners = new Set();

export function onPositionUpdate(fn) { _listeners.add(fn); }
export function offPositionUpdate(fn) { _listeners.delete(fn); }
export function getLastPosition() { return _lastPos; }

function notifyListeners(pos) { _listeners.forEach(fn => fn(pos)); }

export function startWatching() {
  if (_watchId !== null || !('geolocation' in navigator)) return;
  _watchId = navigator.geolocation.watchPosition(
    pos => {
      _lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      notifyListeners(_lastPos);
    },
    err => { console.warn('GPS error:', err.message); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

export function stopWatching() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}

export function requestSingleFix() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  });
}

/* ── Distance + ETA for a destination ───────────────────────────────────── */
export async function getDistanceEta(destLat, destLng) {
  const pos = _lastPos || await requestSingleFix().catch(() => null);
  if (!pos) return null;

  const est = offlineEstimate(pos.lat, pos.lng, destLat, destLng);

  if (navigator.onLine) {
    const online = await getOsrmRoute(pos.lat, pos.lng, destLat, destLng);
    if (online) return { ...online, acc: pos.acc };
  }

  return { ...est, acc: pos.acc };
}
