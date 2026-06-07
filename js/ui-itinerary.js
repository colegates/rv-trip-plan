/* Itinerary panel — detailed day cards with legs table, schedule, and staying card */

import { flyToPlace, fitToDay, DAY_COLORS } from './map-init.js';
import { showBottomSheet } from './markers.js';

let _days   = [];
let _places = [];
let _switchToMap = null;

export function initItinerary(days, places, switchToMapFn) {
  _days        = days;
  _places      = places;
  _switchToMap = switchToMapFn;
  renderItinerary();
}

export function updateItinerary(days, places) {
  _days   = days;
  _places = places;
  renderItinerary();
}

function renderItinerary() {
  const container = document.getElementById('itinerary-list');
  if (!container) return;
  container.innerHTML = '';

  const dayMap    = Object.fromEntries(_days.map(d => [d.id, d]));
  const campByDay = {};
  for (const p of _places) {
    if (p.kind === 'campground' && Array.isArray(p.dayIds)) {
      for (const did of p.dayIds) {
        if (!campByDay[did]) campByDay[did] = p;
      }
    }
  }

  for (const day of _days) {
    const color  = DAY_COLORS[day.id] || '#888';
    const places = _places.filter(p =>
      Array.isArray(p.dayIds) && p.dayIds.includes(day.id)
    );

    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.dayId = day.id;

    const dateStr = day.date
      ? new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : '';

    const statsHtml = [
      day.driveTime     ? `🕐 ${day.driveTime}`      : null,
      day.distanceMiles ? `${day.distanceMiles} mi`   : null,
    ].filter(Boolean).join(' · ');

    card.innerHTML = `
      <div class="day-card-header">
        <div class="day-num" style="background:${color}">D${day.order || '?'}</div>
        <div class="day-meta">
          <div class="day-title">${esc(day.title || day.id)}</div>
          <div class="day-date">${esc(dateStr)}</div>
        </div>
        ${statsHtml ? `<div class="day-stats">${esc(statsHtml)}</div>` : ''}
      </div>
      <div class="day-card-body" id="body-${day.id}"></div>
    `;

    container.appendChild(card);
    buildDayBody(card.querySelector(`#body-${day.id}`), day, places, campByDay, dayMap);

    const header = card.querySelector('.day-card-header');
    const body   = card.querySelector('.day-card-body');
    header.addEventListener('click', () => body.classList.toggle('open'));

    const focusBtn = body.querySelector('.focus-day-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (_switchToMap) _switchToMap();
        setTimeout(() => fitToDay(day.id), 120);
      });
    }
  }
}

function buildDayBody(body, day, places, campByDay, dayMap) {
  /* ── Drive table ─────────────────────────────────────────────────── */
  if (Array.isArray(day.legs) && day.legs.length) {
    const section = document.createElement('div');
    section.className = 'itin-section';
    const rows = day.legs.map(leg => `
      <tr>
        <td>${esc(leg.from)}</td>
        <td>${esc(leg.to)}</td>
        <td class="itin-td-center">${esc(leg.depart || '—')}</td>
        <td class="itin-td-center">${esc(leg.arrive || '—')}</td>
        <td class="itin-td-center">${esc(leg.driveTime || '')}</td>
        <td class="itin-td-right">${leg.miles ? leg.miles + ' mi' : ''}</td>
      </tr>`).join('');
    section.innerHTML = `
      <div class="itin-section-title">Today's drive</div>
      <div class="itin-table-wrap">
        <table class="itin-drive-table">
          <thead><tr>
            <th>From</th><th>To</th>
            <th class="itin-td-center">Depart</th>
            <th class="itin-td-center">Arrive</th>
            <th class="itin-td-center">Drive</th>
            <th class="itin-td-right">Miles</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    body.appendChild(section);
  }

  /* ── Schedule ────────────────────────────────────────────────────── */
  if (Array.isArray(day.schedule) && day.schedule.length) {
    const section = document.createElement('div');
    section.className = 'itin-section';
    const items = day.schedule.map(s => `
      <div class="itin-sched-row">
        ${s.time ? `<span class="itin-sched-time">${esc(s.time)}</span>` : '<span class="itin-sched-time itin-sched-time--empty"></span>'}
        <span class="itin-sched-text">${esc(s.text)}</span>
      </div>`).join('');
    section.innerHTML = `<div class="itin-section-title">Plan</div>${items}`;
    body.appendChild(section);
  }

  /* ── Where you're staying ────────────────────────────────────────── */
  const staySection = document.createElement('div');
  staySection.className = 'itin-section itin-stay-section';
  const camp = campByDay[day.id];

  if (!camp && day.id === 'day7') {
    staySection.innerHTML = `
      <div class="itin-section-title">Where you're staying</div>
      <div class="itin-stay-card itin-stay-flyout">
        <div class="itin-stay-name">Drop-off &amp; fly home</div>
        <div class="itin-stay-detail">Road Bear depot by 10:30 AM &middot; Fly 14:05 to Orlando</div>
      </div>`;
  } else if (camp) {
    const nameHtml = `<div class="itin-stay-name">${esc(camp.name)}</div>`;
    const websiteHtml = camp.website && camp.website.startsWith('https://')
      ? `<a class="itin-stay-website" href="${camp.website}" target="_blank" rel="noopener">🌐 Visit website ↗</a>`
      : '';
    const phoneHtml = camp.phone
      ? `<a class="itin-stay-phone" href="tel:${esc(camp.phone)}">📞 ${formatPhone(camp.phone)}</a>`
      : '';
    const wazeHtml = `<a class="itin-stay-waze" href="https://waze.com/ul?ll=${camp.lat},${camp.lng}" target="_blank" rel="noopener">🔷 Waze</a>`;
    const mapsHtml = `<a class="itin-stay-maps" href="https://www.google.com/maps/dir/?api=1&destination=${camp.lat},${camp.lng}" target="_blank" rel="noopener">🗺️ Google Maps</a>`;
    const addrHtml = camp.address
      ? `<div class="itin-stay-detail">${esc(camp.address)}</div>`
      : '';
    const notesHtml = camp.notes
      ? `<div class="itin-stay-notes">${esc(camp.notes)}</div>`
      : '';
    staySection.innerHTML = `
      <div class="itin-section-title">Where you're staying</div>
      <div class="itin-stay-card">
        ${nameHtml}
        ${addrHtml}
        ${notesHtml}
        <div class="itin-stay-actions">
          ${phoneHtml}
          ${websiteHtml}
          ${wazeHtml}
          ${mapsHtml}
        </div>
      </div>`;
  } else {
    staySection.style.display = 'none';
  }
  body.appendChild(staySection);

  /* ── Place chips ─────────────────────────────────────────────────── */
  const nonCamp = places.filter(p => p.kind !== 'campground');
  if (nonCamp.length) {
    const section = document.createElement('div');
    section.className = 'itin-section itin-chips-section';
    const chipsId = `chips-${day.id}`;
    section.innerHTML = `<div class="itin-section-title">Stops &amp; Points of Interest</div><div class="place-chip-row" id="${chipsId}"></div>`;
    body.appendChild(section);
    const chipsRow = section.querySelector(`#${chipsId}`);
    for (const place of nonCamp) {
      const chip = document.createElement('button');
      chip.className = 'place-chip';
      const icon = place.kind === 'stop' ? '📍' : (CATEGORY_EMOJI[place.category] || '⭐');
      chip.textContent = `${icon} ${place.name}`;
      chip.addEventListener('click', () => {
        if (_switchToMap) _switchToMap();
        setTimeout(() => {
          flyToPlace(place.lat, place.lng, 13);
          showBottomSheet(place, dayMap);
        }, 120);
      });
      chipsRow.appendChild(chip);
    }
  }

  /* ── Focus map button ────────────────────────────────────────────── */
  const focusBtn = document.createElement('button');
  focusBtn.className = 'focus-day-btn';
  focusBtn.dataset.day = day.id;
  focusBtn.textContent = '🗺️ Focus map on this day';
  body.appendChild(focusBtn);
}

const CATEGORY_EMOJI = {
  'Sights':        '🏔️',
  'Wildlife':      '🦬',
  'History':       '🏛️',
  'Food/Brewery':  '🍺',
  'Outdoors':      '🌲',
  'Fuel/Services': '⛽',
  'Lodging':       '🏕️',
};

function formatPhone(raw) {
  const d = raw.replace(/^\+1/, '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : raw;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
