/* Import / Export panel */

import { validate, computeDiff, applyMerge } from './validator.js';
import { getAllDays, getAllPlaces, getTripMeta,
         replaceAll, saveSnapshot, restoreSnapshot, getHistory } from './db.js';

let _onDataChange = null;   // callback after successful import
let _showToast    = null;   // injected to avoid circular dependency with app.js

export function initImport(onDataChangeFn, showToastFn) {
  _onDataChange = onDataChangeFn;
  _showToast    = showToastFn;

  document.getElementById('import-parse-btn').addEventListener('click', handleParse);
  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('reset-btn').addEventListener('click', handleReset);

  loadHistory();
}

/* ── Parse & preview ───────────────────────────────────────────────────────── */
let _pendingDoc  = null;
let _pendingDiff = null;

async function handleParse() {
  const raw = document.getElementById('import-paste').value.trim();
  hideFeedback();
  hidePreview();
  _pendingDoc = null;

  if (!raw) { showFeedback('error', 'Paste a JSON document first.'); return; }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    showFeedback('error', `JSON parse error: ${e.message}`);
    return;
  }

  const { ok, errors, warnings } = validate(doc);
  if (!ok) {
    showFeedback('error', `Validation failed (${errors.length} error${errors.length>1?'s':''}):\n` +
      errors.map(e => typeof e === 'string' ? e : `• ${e.field}: ${e.reason}`).join('\n'));
    return;
  }

  /* Compute diff preview */
  const [existDays, existPlaces] = await Promise.all([getAllDays(), getAllPlaces()]);
  const diff = computeDiff(doc, existDays, existPlaces);

  _pendingDoc  = doc;
  _pendingDiff = diff;

  if (warnings.length) {
    showFeedback('warning', 'Warnings:\n' + warnings.map(w => `• ${w}`).join('\n'));
  }

  showPreview(doc, diff);
}

function showPreview(doc, diff) {
  const previewEl = document.getElementById('import-preview');
  const label = doc.label ? `"${doc.label}"` : `mode: ${doc.mode}`;

  let html = `<h3>Preview — ${esc(label)}</h3><ul style="list-style:none;padding:0;margin:0">`;
  for (const ch of diff) {
    const cls = ch.type === 'add' ? 'diff-add' : ch.type === 'remove' ? 'diff-remove' :
                ch.type === 'update' ? 'diff-update' : 'diff-info';
    const icon = ch.type === 'add' ? '+ ' : ch.type === 'remove' ? '− ' : ch.type === 'update' ? '~ ' : '  ';
    html += `<li class="${cls}" style="padding:2px 0">${icon}${esc(ch.text)}</li>`;
  }
  html += '</ul>';
  html += `<div class="btn-row" style="margin-top:12px">
    <button class="btn btn-green" id="confirm-import-btn">✓ Confirm Import</button>
    <button class="btn btn-ghost" id="cancel-import-btn">Cancel</button>
  </div>`;

  previewEl.innerHTML = html;
  previewEl.classList.add('visible');

  document.getElementById('confirm-import-btn').addEventListener('click', handleConfirm);
  document.getElementById('cancel-import-btn').addEventListener('click', () => {
    hidePreview(); _pendingDoc = null;
  });
}

/* ── Apply import ──────────────────────────────────────────────────────────── */
async function handleConfirm() {
  if (!_pendingDoc) return;

  const doc = _pendingDoc;
  _pendingDoc = null;
  hidePreview();

  /* Save snapshot before applying */
  const snapLabel = doc.label ? `Before: ${doc.label}` : `Before import ${new Date().toLocaleTimeString()}`;
  await saveSnapshot(snapLabel);

  try {
    if (doc.mode === 'replace') {
      await replaceAll(doc.trip, doc.days || [], doc.places || []);
    } else {
      /* merge */
      const [existDays, existPlaces, existMeta] = await Promise.all([
        getAllDays(), getAllPlaces(), getTripMeta()
      ]);
      const { meta, days, places } = applyMerge(doc, existDays, existPlaces, existMeta || {});
      await replaceAll(meta, days, places);
    }

    showFeedback('success', `✓ Import applied${doc.label ? ': "' + doc.label + '"' : ''}. Map and itinerary updated.`);
    document.getElementById('import-paste').value = '';

    if (_onDataChange) await _onDataChange();
    loadHistory();
    if (_showToast) _showToast('Import applied!');

  } catch (e) {
    showFeedback('error', `Import failed: ${e.message}`);
  }
}

/* ── Export ─────────────────────────────────────────────────────────────── */
async function handleExport() {
  const [meta, days, places] = await Promise.all([getTripMeta(), getAllDays(), getAllPlaces()]);
  const doc = {
    schema:  'rvtrip.v1',
    mode:    'replace',
    label:   `Export ${new Date().toLocaleDateString()}`,
    trip:    meta || {},
    days,
    places
  };
  const json = JSON.stringify(doc, null, 2);

  /* Try native share, fall back to copy/download */
  if (navigator.share && navigator.canShare && navigator.canShare({ text: json })) {
    try {
      await navigator.share({ title: 'RV Trip Itinerary', text: json });
      if (_showToast) _showToast('Shared!');
      return;
    } catch {}
  }

  /* Copy to clipboard */
  try {
    await navigator.clipboard.writeText(json);
    if (_showToast) _showToast('Copied to clipboard!');
    return;
  } catch {}

  /* Fallback: download */
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'rvtrip-export.json';
  a.click();
  URL.revokeObjectURL(url);
  if (_showToast) _showToast('Downloaded!');
}

/* ── Reset to bundled data ──────────────────────────────────────────────── */
async function handleReset() {
  const confirmed = await showConfirmDialog(
    'Reset to bundled itinerary?',
    'This will replace ALL current data with the original trip.json. A snapshot will be saved first so you can undo.'
  );
  if (!confirmed) return;

  await saveSnapshot('Before reset to bundled itinerary');

  try {
    const res = await fetch('./trip.json');
    if (!res.ok) throw new Error('Could not load trip.json');
    const doc = await res.json();
    await replaceAll(doc.trip, doc.days || [], doc.places || []);
    showFeedback('success', '✓ Reset to bundled itinerary complete.');
    if (_onDataChange) await _onDataChange();
    loadHistory();
    if (_showToast) _showToast('Reset complete!');
  } catch (e) {
    showFeedback('error', `Reset failed: ${e.message}`);
  }
}

/* ── History ────────────────────────────────────────────────────────────── */
async function loadHistory() {
  const list    = document.getElementById('import-history');
  const history = await getHistory();
  list.innerHTML = '';

  if (!history.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No import history yet.</li>';
    return;
  }

  for (const snap of history.slice(0, 8)) {
    const li   = document.createElement('li');
    li.className = 'history-item';
    const date = new Date(snap.ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    li.innerHTML = `
      <div>
        <div>${esc(snap.label || 'Snapshot')}</div>
        <div class="history-meta">${esc(date)} · ${snap.days?.length||0} days, ${snap.places?.length||0} places</div>
      </div>
      <button class="undo-btn" data-ts="${snap.ts}">Undo</button>
    `;
    li.querySelector('.undo-btn').addEventListener('click', async () => {
      const ok = await showConfirmDialog('Undo this import?', `Restore snapshot: "${snap.label || 'Snapshot'}"`);
      if (!ok) return;
      await saveSnapshot('Before undo');
      await restoreSnapshot(snap.ts);
      if (_onDataChange) await _onDataChange();
      loadHistory();
      if (_showToast) _showToast('Snapshot restored!');
    });
    list.appendChild(li);
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function showFeedback(type, msg) {
  const el = document.getElementById('import-feedback');
  el.className = `visible ${type}`;
  el.style.whiteSpace = 'pre-wrap';
  el.textContent = msg;
}
function hideFeedback() {
  document.getElementById('import-feedback').classList.remove('visible');
}
function hidePreview() {
  document.getElementById('import-preview').classList.remove('visible');
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* Simple promise-based confirm dialog */
function showConfirmDialog(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.add('open');

    function cleanup(result) {
      overlay.classList.remove('open');
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
      resolve(result);
    }
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
  });
}
