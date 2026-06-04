/* Itinerary panel — day cards */

import { flyToPlace, fitToDay, DAY_COLORS } from './map-init.js';
import { showBottomSheet } from './markers.js';

let _days   = [];
let _places = [];
let _switchToMap = null;   // callback to switch to map tab

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

  const dayMap = Object.fromEntries(_days.map(d => [d.id, d]));

  for (const day of _days) {
    const color = DAY_COLORS[day.id] || '#888';
    const places = _places.filter(p =>
      Array.isArray(p.dayIds) && p.dayIds.includes(day.id)
    ).sort((a, b) => (a.order || 0) - (b.order || 0));

    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.dayId = day.id;

    const dateStr = day.date ? new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const statsHtml = [
      day.driveTime     ? day.driveTime       : null,
      day.distanceMiles ? `${day.distanceMiles} mi` : null
    ].filter(Boolean).join('<br>');

    card.innerHTML = `
      <div class="day-card-header">
        <div class="day-num" style="background:${color}">D${day.order || '?'}</div>
        <div class="day-meta">
          <div class="day-title">${esc(day.title || day.id)}</div>
          <div class="day-date">${esc(dateStr)}${day.fromTo ? ' · ' + esc(day.fromTo) : ''}</div>
        </div>
        ${statsHtml ? `<div class="day-stats">${statsHtml}</div>` : ''}
      </div>
      <div class="day-card-body" id="body-${day.id}">
        ${day.summary ? `<div class="day-summary">${esc(day.summary)}</div>` : ''}
        ${places.length ? `
          <div class="day-places-title">Stops & Points of Interest</div>
          <div class="place-chip-row" id="chips-${day.id}"></div>
        ` : ''}
        <button class="focus-day-btn" data-day="${day.id}">🗺️ Focus map on this day</button>
      </div>
    `;

    container.appendChild(card);

    /* Add place chips */
    if (places.length) {
      const chipsRow = card.querySelector(`#chips-${day.id}`);
      for (const place of places) {
        const chip = document.createElement('button');
        chip.className = 'place-chip';
        const icon = place.kind === 'campground' ? '🏕️' : place.kind === 'stop' ? '📍' : '⭐';
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

    /* Toggle expand/collapse */
    const header = card.querySelector('.day-card-header');
    const body   = card.querySelector('.day-card-body');
    header.addEventListener('click', () => {
      body.classList.toggle('open');
    });

    /* Focus map button */
    const focusBtn = card.querySelector('.focus-day-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_switchToMap) _switchToMap();
        setTimeout(() => fitToDay(day.id), 120);
      });
    }
  }
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
