#!/usr/bin/env bash
# build-basemap.sh — Download and extract a PMTiles basemap for the route corridor.
#
# Route bbox: Denver (CO) → Casper (WY) → Thermopolis → Yellowstone NP
# West: -111.2  East: -104.4  South: 39.6  North: 45.2
#
# Output: basemap.pmtiles in the repo root (must be <100 MB for GitHub Pages)
#
# Prerequisites:
#   npm install -g pmtiles        (installs the pmtiles CLI)
#   OR: go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest
#
# On Apple Silicon: homebrew install pmtiles

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${REPO_ROOT}/basemap.pmtiles"

# Bounding box covering the full route corridor
BBOX="-111.2,39.6,-104.4,45.2"
MAXZOOM=12

# ── Option A: Extract from Protomaps latest build (recommended) ──────────────
#
# The Protomaps project publishes a daily planet PMTiles build.
# Check https://maps.protomaps.com/builds/ for the latest available date.
# Extraction uses HTTP range requests — no full planet download needed!

echo "=== RV Trip Basemap Builder ==="
echo "Output: ${OUTPUT}"
echo "Bbox: ${BBOX}"
echo "Max zoom: ${MAXZOOM}"
echo ""

if command -v pmtiles &>/dev/null; then
  echo "Found pmtiles CLI — extracting from Protomaps build…"
  echo ""
  echo "Note: This uses HTTP range requests against the Protomaps CDN."
  echo "It will download only the tiles within the bbox (much less than the full planet)."
  echo ""

  # Find the latest build (try last 7 days)
  BUILD_URL=""
  for i in 0 1 2 3 4 5 6 7; do
    DATE=$(date -d "-${i} days" +%Y%m%d 2>/dev/null || date -v-${i}d +%Y%m%d 2>/dev/null)
    CANDIDATE="https://build.protomaps.com/${DATE}.pmtiles"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --head "${CANDIDATE}")
    if [ "${STATUS}" = "200" ] || [ "${STATUS}" = "206" ]; then
      BUILD_URL="${CANDIDATE}"
      echo "Using build: ${DATE}"
      break
    fi
  done

  if [ -z "${BUILD_URL}" ]; then
    echo "ERROR: Could not find a recent Protomaps build. Check https://maps.protomaps.com/builds/"
    echo "You can also use Option B below (GUI download from Protomaps)."
    exit 1
  fi

  pmtiles extract "${BUILD_URL}" "${OUTPUT}" \
    --bbox="${BBOX}" \
    --maxzoom="${MAXZOOM}"

  SIZE_MB=$(du -m "${OUTPUT}" | cut -f1)
  echo ""
  echo "✓ Done! basemap.pmtiles = ${SIZE_MB} MB"

  if [ "${SIZE_MB}" -gt 95 ]; then
    echo ""
    echo "⚠️  WARNING: File is ${SIZE_MB} MB — close to GitHub's 100 MB hard limit!"
    echo "   Consider reducing maxzoom to 11 and re-running:"
    echo "   MAXZOOM=11  ./scripts/build-basemap.sh"
  else
    echo "   File is within GitHub Pages limits (< 100 MB). You can commit this file."
  fi

else
  echo "ERROR: 'pmtiles' CLI not found."
  echo ""
  echo "Install it with ONE of:"
  echo "  npm install -g pmtiles"
  echo "  brew install pmtiles          (macOS)"
  echo "  go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest"
  echo ""
  echo "=== Option B: GUI download (no CLI needed) ==="
  echo ""
  echo "1. Open https://app.protomaps.com"
  echo "2. Draw a box covering the route: Denver to Yellowstone"
  echo "   (roughly: W=-111.2, S=39.6, E=-104.4, N=45.2)"
  echo "3. Select max zoom 12, theme 'Light', format 'PMTiles'"
  echo "4. Download — rename to 'basemap.pmtiles'"
  echo "5. Move it to the repo root (same folder as index.html)"
  echo "6. Verify size: du -sh basemap.pmtiles  (must be < 100 MB)"
  echo ""
  echo "After placing basemap.pmtiles in the repo root:"
  echo "   git add basemap.pmtiles"
  echo "   git commit -m 'Add offline basemap'"
  echo "   git push"
  exit 1
fi

echo ""
echo "Next steps:"
echo "  git add basemap.pmtiles"
echo "  git commit -m 'Add offline basemap (zoom 0-${MAXZOOM})'"
echo "  git push"
