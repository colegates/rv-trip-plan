/* rvtrip.v1 import format validator */

const ID_RE     = /^[a-z0-9-]+$/;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;
const DRIVE_RE  = /^\d+h\d{2}$/;
const KINDS     = new Set(['campground', 'stop', 'poi']);
const CATS      = new Set(['Sights', 'Wildlife', 'History', 'Food/Brewery', 'Outdoors', 'Fuel/Services', 'Lodging']);
const MODES     = new Set(['merge', 'replace']);

function err(field, reason) { return { field, reason }; }

function validateDay(day, i, idsSeen) {
  const errors = [];
  const prefix = `days[${i}]`;
  if (!day.id)                                    errors.push(err(`${prefix}.id`,      'required'));
  else if (!ID_RE.test(day.id))                   errors.push(err(`${prefix}.id`,      `must match ^[a-z0-9-]+$ (got "${day.id}")`));
  else if (idsSeen.has(day.id))                   errors.push(err(`${prefix}.id`,      `duplicate id "${day.id}"`));
  else                                             idsSeen.add(day.id);
  if (day.date && !DATE_RE.test(day.date))        errors.push(err(`${prefix}.date`,    'must be YYYY-MM-DD'));
  if (day.driveTime && !DRIVE_RE.test(day.driveTime) && day.driveTime !== '')
                                                  errors.push(err(`${prefix}.driveTime`, 'must be like "4h30" or empty string'));
  if (day.distanceMiles !== undefined && day.distanceMiles !== null &&
      (typeof day.distanceMiles !== 'number' || day.distanceMiles < 0))
                                                  errors.push(err(`${prefix}.distanceMiles`, 'must be a non-negative number'));
  if (day.order !== undefined && typeof day.order !== 'number')
                                                  errors.push(err(`${prefix}.order`, 'must be a number'));
  return errors;
}

function validatePlace(place, i, idsSeen, knownDayIds, warnings) {
  const errors = [];
  const prefix = `places[${i}]`;
  if (!place.id)                                  errors.push(err(`${prefix}.id`,   'required'));
  else if (!ID_RE.test(place.id))                 errors.push(err(`${prefix}.id`,   `must match ^[a-z0-9-]+$ (got "${place.id}")`));
  else if (idsSeen.has(place.id))                 errors.push(err(`${prefix}.id`,   `duplicate id "${place.id}"`));
  else                                            idsSeen.add(place.id);
  if (!place.name)                                errors.push(err(`${prefix}.name`, 'required'));
  if (place.lat === undefined || place.lat === null)  errors.push(err(`${prefix}.lat`, 'required'));
  else if (typeof place.lat !== 'number' || place.lat < -90  || place.lat > 90)
                                                  errors.push(err(`${prefix}.lat`, 'must be number ∈ [-90, 90]'));
  if (place.lng === undefined || place.lng === null)  errors.push(err(`${prefix}.lng`, 'required'));
  else if (typeof place.lng !== 'number' || place.lng < -180 || place.lng > 180)
                                                  errors.push(err(`${prefix}.lng`, 'must be number ∈ [-180, 180]'));
  if (!place.kind)                                errors.push(err(`${prefix}.kind`, 'required'));
  else if (!KINDS.has(place.kind))                errors.push(err(`${prefix}.kind`, `must be campground|stop|poi (got "${place.kind}")`));
  if (place.kind === 'poi') {
    if (!place.category)                          errors.push(err(`${prefix}.category`, 'required when kind=poi'));
    else if (!CATS.has(place.category))           errors.push(err(`${prefix}.category`, `must be one of: ${[...CATS].join(', ')} (got "${place.category}")`));
  }
  if (Array.isArray(place.dayIds) && knownDayIds) {
    for (const did of place.dayIds) {
      if (!knownDayIds.has(did)) {
        warnings.push(`places[${i}] (id="${place.id}") references unknown dayId "${did}" — will still import`);
      }
    }
  }
  return errors;
}

/* ── Main validator ──────────────────────────────────────────────────────── */
export function validate(doc) {
  const errors   = [];
  const warnings = [];

  /* Envelope */
  if (!doc || typeof doc !== 'object')         { return { ok: false, errors: ['document must be a JSON object'], warnings: [] }; }
  if (doc.schema !== 'rvtrip.v1')              errors.push('schema must equal "rvtrip.v1"');
  if (!doc.mode || !MODES.has(doc.mode))       errors.push('mode must be "merge" or "replace"');

  if (errors.length) return { ok: false, errors, warnings };

  const mode = doc.mode;

  /* trip block (required for replace) */
  if (mode === 'replace') {
    if (!doc.trip) {
      errors.push('trip is required when mode=replace');
    } else {
      const t = doc.trip;
      if (!t.title)     errors.push('trip.title is required');
      if (!t.startDate) errors.push('trip.startDate is required');
      else if (!DATE_RE.test(t.startDate)) errors.push('trip.startDate must be YYYY-MM-DD');
      if (!t.endDate)   errors.push('trip.endDate is required');
      else if (!DATE_RE.test(t.endDate))   errors.push('trip.endDate must be YYYY-MM-DD');
    }
    if (!Array.isArray(doc.days)   || doc.days.length   < 1) errors.push('days must be array with ≥1 entry when mode=replace');
    if (!Array.isArray(doc.places) || doc.places.length < 1) errors.push('places must be array with ≥1 entry when mode=replace');
    if (errors.length) return { ok: false, errors, warnings };
  }

  /* Days */
  const dayIdsSeen = new Set();
  const allDayIds  = new Set();
  if (Array.isArray(doc.days)) {
    for (let i = 0; i < doc.days.length; i++) {
      const e = validateDay(doc.days[i], i, dayIdsSeen);
      errors.push(...e);
      if (!e.length && doc.days[i].id) allDayIds.add(doc.days[i].id);
    }
  }
  if (errors.length) return { ok: false, errors, warnings };

  /* Places */
  const placeIdsSeen = new Set();
  if (Array.isArray(doc.places)) {
    for (let i = 0; i < doc.places.length; i++) {
      const e = validatePlace(doc.places[i], i, placeIdsSeen, allDayIds.size ? allDayIds : null, warnings);
      errors.push(...e);
    }
  }

  /* remove block (merge only) */
  if (doc.remove && mode === 'replace') {
    warnings.push('"remove" is ignored when mode=replace');
  }
  if (doc.remove && mode === 'merge') {
    if (doc.remove.days && !Array.isArray(doc.remove.days))     errors.push('remove.days must be an array');
    if (doc.remove.places && !Array.isArray(doc.remove.places)) errors.push('remove.places must be an array');
  }

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, errors: [], warnings };
}

/* ── Diff preview ─────────────────────────────────────────────────────── */
export function computeDiff(doc, existingDays, existingPlaces) {
  const existDayMap   = Object.fromEntries(existingDays.map(d => [d.id, d]));
  const existPlaceMap = Object.fromEntries(existingPlaces.map(p => [p.id, p]));
  const changes = [];

  if (doc.mode === 'replace') {
    const addedD   = (doc.days   || []).filter(d => !existDayMap[d.id]).length;
    const updatedD = (doc.days   || []).filter(d =>  existDayMap[d.id]).length;
    const addedP   = (doc.places || []).filter(p => !existPlaceMap[p.id]).length;
    const updatedP = (doc.places || []).filter(p =>  existPlaceMap[p.id]).length;
    const removedD = existingDays.filter(d   => !(doc.days   || []).find(x => x.id === d.id)).length;
    const removedP = existingPlaces.filter(p => !(doc.places || []).find(x => x.id === p.id)).length;

    if (doc.trip)   changes.push({ type: 'update', text: 'Replace trip metadata' });
    if (addedD)     changes.push({ type: 'add',    text: `Add ${addedD} day${addedD>1?'s':''}` });
    if (updatedD)   changes.push({ type: 'update', text: `Update ${updatedD} day${updatedD>1?'s':''}` });
    if (removedD)   changes.push({ type: 'remove', text: `Remove ${removedD} day${removedD>1?'s':''}` });
    if (addedP)     changes.push({ type: 'add',    text: `Add ${addedP} place${addedP>1?'s':''}` });
    if (updatedP)   changes.push({ type: 'update', text: `Update ${updatedP} place${updatedP>1?'s':''}` });
    if (removedP)   changes.push({ type: 'remove', text: `Remove ${removedP} place${removedP>1?'s':''}` });
    return changes;
  }

  /* merge */
  for (const d of (doc.days || [])) {
    changes.push(existDayMap[d.id]
      ? { type: 'update', text: `Update day "${d.id}"${d.title ? ' ('+d.title+')' : ''}` }
      : { type: 'add',    text: `Add day "${d.id}"${d.title ? ' ('+d.title+')' : ''}` });
  }
  for (const p of (doc.places || [])) {
    changes.push(existPlaceMap[p.id]
      ? { type: 'update', text: `Update place "${p.id}" (${p.name})` }
      : { type: 'add',    text: `Add place "${p.id}" (${p.name})` });
  }
  const rmDays   = (doc.remove && doc.remove.days)   || [];
  const rmPlaces = (doc.remove && doc.remove.places) || [];
  for (const id of rmDays)   changes.push({ type: 'remove', text: `Remove day "${id}"` });
  for (const id of rmPlaces) changes.push({ type: 'remove', text: `Remove place "${id}"` });
  if (!changes.length)       changes.push({ type: 'info',   text: 'No changes' });
  return changes;
}

/* ── Apply import to DB data ─────────────────────────────────────────────── */
export function applyMerge(doc, existingDays, existingPlaces, existingMeta) {
  const dayMap   = Object.fromEntries(existingDays.map(d => [d.id, { ...d }]));
  const placeMap = Object.fromEntries(existingPlaces.map(p => [p.id, { ...p }]));

  for (const d of (doc.days || [])) {
    dayMap[d.id] = dayMap[d.id] ? { ...dayMap[d.id], ...d } : { ...d };
  }
  for (const p of (doc.places || [])) {
    placeMap[p.id] = placeMap[p.id] ? { ...placeMap[p.id], ...p } : { ...p };
  }

  const rmDays   = (doc.remove && doc.remove.days)   || [];
  const rmPlaces = (doc.remove && doc.remove.places) || [];
  for (const id of rmDays)   delete dayMap[id];
  for (const id of rmPlaces) delete placeMap[id];

  const meta = doc.trip ? { ...existingMeta, ...doc.trip } : existingMeta;
  return {
    meta,
    days:   Object.values(dayMap).sort((a,b) => (a.order||0) - (b.order||0)),
    places: Object.values(placeMap)
  };
}
