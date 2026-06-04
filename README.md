# 🏕️ RV Trip — Denver ↔ Yellowstone

Offline-first Progressive Web App for a family RV road trip, 9–15 July 2026.

**Live URL:** `https://colegates.github.io/rv-trip-plan/`

---

## Quick start (deploy to GitHub Pages)

```bash
git clone https://github.com/colegates/rv-trip-plan.git
cd rv-trip-plan

# 1. Build the offline basemap (see below — one-time)
./scripts/build-basemap.sh

# 2. Commit basemap
git add basemap.pmtiles
git commit -m "Add offline basemap"
git push

# 3. Enable GitHub Pages in repo Settings → Pages → Branch: main / root
#    The site will be live at https://colegates.github.io/rv-trip-plan/
```

---

## Building the offline basemap

The map works offline because it uses a **PMTiles** vector tile archive committed directly to the repo. You generate this file once and push it.

### Prerequisites

Install the `pmtiles` CLI (one of):

```bash
npm install -g pmtiles           # cross-platform
brew install pmtiles             # macOS
go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest
```

### Generate the extract

```bash
./scripts/build-basemap.sh
```

This downloads only the tiles within the route corridor (Denver → Casper → Thermopolis → Yellowstone) at zoom 0–12 from the daily Protomaps build — using HTTP range requests, so no full planet download is needed.

**Expected output size:** 20–70 MB depending on day's build. GitHub Pages hard limit is **100 MB per file**. If the output exceeds ~80 MB, reduce `MAXZOOM` to `11` in the script.

> ⚠️ **Git LFS is NOT used.** GitHub Pages does not serve LFS-tracked files. The `basemap.pmtiles` file must be a real committed file under 100 MB.

### Alternative: GUI download

1. Open [app.protomaps.com](https://app.protomaps.com)
2. Draw a box: W=-111.2, S=39.6, E=-104.4, N=45.2 (or paste those coordinates)
3. Select **Max zoom 12**, format **PMTiles**
4. Download, rename to `basemap.pmtiles`, place in repo root
5. `git add basemap.pmtiles && git commit -m "Add basemap" && git push`

### Refreshing the basemap

If you want a newer Protomaps build (e.g., for updated roads):

```bash
./scripts/build-basemap.sh          # overwrites basemap.pmtiles
git add basemap.pmtiles
git commit -m "Refresh basemap $(date +%Y-%m-%d)"
git push
```

Then bump `CACHE_VERSION` in `sw.js` (e.g., `v1` → `v2`) so existing clients download the new file.

---

## Add to iPhone Home Screen

> **Requires HTTPS** — GitHub Pages provides this automatically. Service workers and geolocation do **not** work on `http://`.

1. Open `https://colegates.github.io/rv-trip-plan/` in **Safari** on iPhone
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Name it "RV Trip" and tap **Add**

The app will open full-screen (no browser chrome) and work completely offline after the first load.

---

## First load & offline caching

On first load (you must be **online**):

1. The app shell (HTML, CSS, JS, map libraries) is cached immediately
2. The service worker downloads and caches `basemap.pmtiles` in the background (progress shown on loading screen)
3. After that, **everything works in Airplane Mode** including GPS

The service worker intercepts HTTP range requests for the PMTiles file and serves slices from the cached blob — this is how MapLibre can render tiles without network.

---

## Import / Update itinerary

Tap the **Import** tab. Paste a JSON document in `rvtrip.v1` format:

```json
{
  "schema": "rvtrip.v1",
  "mode": "merge",
  "label": "Add fuel stop",
  "places": [
    {
      "id": "maverik-cody",
      "kind": "poi",
      "name": "Maverik — Cody",
      "category": "Fuel/Services",
      "lat": 44.5246,
      "lng": -109.0667,
      "notes": "Last good-value fuel before the park",
      "dayIds": ["day2", "day5"]
    }
  ]
}
```

- **mode: "merge"** — upsert by id; use `"remove": { "places": ["some-id"] }` to delete
- **mode: "replace"** — full replacement; requires `trip`, `days` (≥1), and `places` (≥1)
- The app validates strictly, shows a **preview diff**, and requires confirmation before applying
- A **snapshot** is saved automatically before each import so you can **Undo** from the history list
- **Export** (Import tab → Export) produces a valid `rvtrip.v1 replace` document you can paste back

### rvtrip.v1 format rules

| Field | Required | Notes |
|-------|----------|-------|
| `schema` | yes | Must equal `"rvtrip.v1"` |
| `mode` | yes | `"merge"` or `"replace"` |
| `label` | no | Short description shown in history |
| `trip` | if replace | `{ title, startDate, endDate, vehicle, booking, notes }` |
| `days` | if replace | Array of day objects with `id`, `date`, `title`, etc. |
| `places` | if replace | Array of place objects |
| `remove` | merge only | `{ "days": [ids], "places": [ids] }` |

**place object:** `{ id*, name*, lat*, lng*, kind* (campground|stop|poi), category* (if poi), address, phone, notes, dayIds, order }`
**Validation:** ids must match `^[a-z0-9-]+$`, lat ∈ [-90,90], lng ∈ [-180,180], dates YYYY-MM-DD. Any error rejects the whole document.

---

## GPS distance & ETA

Tap any marker → **Distance & ETA from me**:

- Uses `navigator.geolocation` (works offline, requires HTTPS + user permission)
- **Online:** fetches real driving distance/time from OSRM demo API, falls back silently
- **Offline:** haversine × 1.25 road factor, 55 mph highway / 35 mph in Yellowstone
- Always offers **Open in Maps** (Apple Maps deep link) and Google Maps fallback

---

## Repo structure

```
├── index.html               # App shell
├── sw.js                    # Service worker (offline caching)
├── manifest.webmanifest     # PWA manifest
├── trip.json                # Bundled seed data (rvtrip.v1 format)
├── basemap.pmtiles          # Offline vector map (generated — see above)
├── css/app.css              # Styles
├── js/
│   ├── app.js               # Main orchestrator
│   ├── db.js                # IndexedDB wrapper
│   ├── validator.js         # rvtrip.v1 validator + diff engine
│   ├── gps.js               # Geolocation + haversine + OSRM
│   ├── map-init.js          # MapLibre initialisation + route polylines
│   ├── markers.js           # Marker rendering + bottom sheet
│   ├── ui-import.js         # Import/export UI
│   └── ui-itinerary.js      # Day cards
├── lib/
│   ├── maplibre-gl.js       # MapLibre GL JS 4.7.1 (self-hosted)
│   ├── maplibre-gl.css      # MapLibre styles
│   └── pmtiles.js           # PMTiles protocol library 3.2.0
├── icons/                   # PWA icons (192, 512, apple-touch)
└── scripts/
    ├── build-basemap.sh     # Generate basemap.pmtiles
    ├── setup.sh             # One-time dev setup
    └── generate-icons.js    # Regenerate PNG icons (Node.js)
```

---

## Acceptance tests

### Test 1 — Full offline operation
1. Load the app once on mobile/desktop while **online** (wait for "Ready!" or progress to complete)
2. Enable **Airplane Mode**
3. Close the browser tab, reopen from Home Screen (or navigate back to the URL)
4. ✅ Map loads with basemap tiles, route polylines, and all markers
5. Tap a marker → bottom sheet shows name, notes, ETA button
6. Tap **Distance & ETA** → shows offline haversine estimate labelled "approx (offline estimate)"
7. Tap **Open in Maps** → deep links to Apple Maps with coordinates

### Test 2 — Import merge
1. Go to the **Import** tab
2. Paste a valid merge document (e.g., the example in this README)
3. Tap **Validate & Preview** → see diff summary
4. Tap **Confirm Import** → map and itinerary update immediately
5. Reload the page → data persists (stored in IndexedDB)

### Test 3 — Import validation rejection
1. Paste invalid JSON (e.g., missing `schema` field, wrong mode, bad lat/lng)
2. Tap **Validate & Preview**
3. ✅ Error message shows specific field + reason; nothing changes in the app

---

## Updating the cache (app updates)

1. Make changes to files
2. Bump `CACHE_VERSION` in `sw.js` (e.g., `'v1'` → `'v2'`)
3. Push — existing users will see a "App updated — refresh" toast on next visit

---

## Notes

- **GitHub Pages & range requests:** PMTiles requires HTTP range requests. GitHub Pages supports these natively — no special configuration needed.
- **Storage:** The app uses IndexedDB for trip data and the Cache API for the app shell + basemap. Total storage is roughly: basemap (~30–70 MB) + app shell (~2 MB).
- **HTTPS requirement:** Service workers and `navigator.geolocation` require HTTPS. GitHub Pages provides this automatically for `*.github.io` domains. For custom domains, enable HTTPS in repo Settings → Pages.
- **Library versions:** MapLibre GL JS 4.7.1, PMTiles 3.2.0. To upgrade, download new versions to `lib/` and test.