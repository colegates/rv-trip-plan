/* IndexedDB wrapper — single source of truth for trip data */

const DB_NAME = 'rv-trip';
const DB_VERSION = 1;
const STORES = ['trip', 'days', 'places', 'history'];

let _db = null;

export async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('trip'))    db.createObjectStore('trip',    { keyPath: 'key' });
      if (!db.objectStoreNames.contains('days'))    db.createObjectStore('days',    { keyPath: 'id' });
      if (!db.objectStoreNames.contains('places'))  db.createObjectStore('places',  { keyPath: 'id' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'ts' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

function promisify(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

/* ── Trip meta ─────────────────────────────────────────────────────────── */
export async function getTripMeta()        { return promisify(tx('trip').get('meta')); }
export async function setTripMeta(data)    { return promisify(tx('trip','readwrite').put({ key: 'meta', ...data })); }

/* ── Days ──────────────────────────────────────────────────────────────── */
export async function getAllDays() {
  return new Promise((res, rej) => {
    const req  = tx('days').getAll();
    req.onsuccess = e => res(e.target.result.sort((a,b) => (a.order||0) - (b.order||0)));
    req.onerror   = e => rej(e.target.error);
  });
}
export async function putDay(day)       { return promisify(tx('days','readwrite').put(day)); }
export async function deleteDay(id)     { return promisify(tx('days','readwrite').delete(id)); }

/* ── Places ────────────────────────────────────────────────────────────── */
export async function getAllPlaces() {
  return new Promise((res, rej) => {
    const req = tx('places').getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
export async function putPlace(place)   { return promisify(tx('places','readwrite').put(place)); }
export async function deletePlace(id)   { return promisify(tx('places','readwrite').delete(id)); }

/* ── History ───────────────────────────────────────────────────────────── */
export async function saveSnapshot(label) {
  const [meta, days, places] = await Promise.all([getTripMeta(), getAllDays(), getAllPlaces()]);
  const snap = { ts: Date.now(), label, meta, days, places };
  return promisify(tx('history','readwrite').put(snap));
}

export async function getHistory() {
  return new Promise((res, rej) => {
    const req = tx('history').getAll();
    req.onsuccess = e => res(e.target.result.sort((a,b) => b.ts - a.ts));
    req.onerror   = e => rej(e.target.error);
  });
}

export async function restoreSnapshot(ts) {
  const snap = await promisify(tx('history').get(ts));
  if (!snap) throw new Error('Snapshot not found');

  const db = await openDB();
  const txn = db.transaction(['trip','days','places'], 'readwrite');

  const clearStore = name => new Promise((res, rej) => {
    const req = txn.objectStore(name).clear();
    req.onsuccess = res; req.onerror = rej;
  });
  const putAll = (name, items) =>
    Promise.all(items.map(item => promisify(txn.objectStore(name).put(item))));

  await clearStore('days');
  await clearStore('places');
  if (snap.meta) await promisify(txn.objectStore('trip').put({ key: 'meta', ...snap.meta }));
  await putAll('days',   snap.days   || []);
  await putAll('places', snap.places || []);

  return new Promise((res, rej) => {
    txn.oncomplete = res; txn.onerror = rej;
  });
}

/* ── Bulk replace (for initial seed + full imports) ────────────────────── */
export async function replaceAll(meta, days, places) {
  const db = await openDB();
  const txn = db.transaction(['trip','days','places'], 'readwrite');

  const clearStore = name => new Promise((res, rej) => {
    const req = txn.objectStore(name).clear();
    req.onsuccess = res; req.onerror = rej;
  });
  const putAll = (name, items) =>
    Promise.all(items.map(item => promisify(txn.objectStore(name).put(item))));

  await clearStore('days');
  await clearStore('places');
  if (meta) await promisify(txn.objectStore('trip').put({ key: 'meta', ...meta }));
  await putAll('days',   days   || []);
  await putAll('places', places || []);

  return new Promise((res, rej) => {
    txn.oncomplete = res; txn.onerror = rej;
  });
}

/* ── Storage estimate ──────────────────────────────────────────────────── */
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageMB: (usage / 1048576).toFixed(1), quotaMB: (quota / 1048576).toFixed(0) };
  }
  return null;
}

/* ── Seed check ────────────────────────────────────────────────────────── */
export async function isEmpty() {
  const days = await getAllDays();
  return days.length === 0;
}
