#!/usr/bin/env bash
# setup.sh — One-time setup for the RV Trip PWA.
# Run this once after cloning the repo (already done if you see lib/ populated).
# The lib/ files are committed — you only need this if you're starting fresh.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

echo "=== RV Trip PWA — Setup ==="
echo ""

# ── 1. Regenerate icons ───────────────────────────────────────────────────
echo "Generating PWA icons…"
node scripts/generate-icons.js
echo ""

# ── 2. Verify library files ───────────────────────────────────────────────
echo "Checking self-hosted libraries…"
for f in lib/maplibre-gl.js lib/maplibre-gl.css lib/pmtiles.js; do
  if [ -f "${f}" ]; then
    SIZE=$(du -k "${f}" | cut -f1)
    echo "  ✓ ${f} (${SIZE} KB)"
  else
    echo "  ✗ MISSING: ${f}"
    echo "    Run the download commands below to fetch it."
    MISSING=1
  fi
done

if [ "${MISSING:-0}" = "1" ]; then
  echo ""
  echo "Download missing libraries:"
  echo "  curl -sL https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js  -o lib/maplibre-gl.js"
  echo "  curl -sL https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css -o lib/maplibre-gl.css"
  echo "  curl -sL https://cdn.jsdelivr.net/npm/pmtiles@3.2.0/dist/pmtiles.js          -o lib/pmtiles.js"
fi

echo ""

# ── 3. Check basemap ──────────────────────────────────────────────────────
if [ -f "basemap.pmtiles" ]; then
  SIZE_MB=$(du -m basemap.pmtiles | cut -f1)
  echo "✓ basemap.pmtiles found (${SIZE_MB} MB)"
else
  echo "⚠️  basemap.pmtiles not found — map will show blank tiles offline."
  echo "   Run: ./scripts/build-basemap.sh"
  echo "   Or download from https://app.protomaps.com and save as basemap.pmtiles"
fi

echo ""
echo "=== Setup complete ==="
echo "Serve locally:  python3 -m http.server 8080  (then open http://localhost:8080)"
echo "Deploy:         git push → GitHub Pages"
