#!/usr/bin/env bash
# Drives Stage 2 and Stage 5 over every interval in the store.
#
# One interval at a time, and the GeoJSON is deleted as soon as its tiles
# exist. The intermediate is about a hundred gigabytes across the series and
# nothing reads it twice, so keeping it would cost disk for no evidence: the
# authoritative product is the run store, and the tiles carry their own
# checksums in the manifest this writes.
set -euo pipefail

root="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
store="$root/derived/phase2-per-cell-geometry-1984-2022-v1"
work="$root/work/per-cell-geojson"
tiles="$store/tiles"
mkdir -p "$work" "$tiles"

intervals=$(node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(manifest.intervals.map((entry) => entry.interval).join("\n"));
' "$store/manifest.json")

for interval in $intervals; do
  if [ -s "$tiles/$interval.pmtiles" ]; then
    printf 'skip %s (already built)\n' "$interval"
    continue
  fi
  printf '=== %s ===\n' "$interval"
  node --max-old-space-size=8192 scripts/emit-phase2-per-cell-geojson.mjs "$interval" "$work/$interval.geojsonl"
  ./scripts/build-phase2-per-cell-tiles.sh "$interval" "$work/$interval.geojsonl" "$tiles/$interval.pmtiles" 2>&1 | tail -1
  rm -f "$work/$interval.geojsonl"
done

printf 'all intervals tiled\n'
