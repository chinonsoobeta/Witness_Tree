#!/usr/bin/env bash
# The span archive: all 38 four-province annual intervals in one PMTiles
# archive and one layer, `spans`, each patch carrying the closing year of the
# interval it was lost in. The map shows any span from 1984 to 2022 by
# filtering on that year, so moving a year handle changes a filter, never a
# source, and the patches drawn are every patch lost at least once in the span.
#
# The geometry is the four-province clipped store, patch for patch, emitted by
# the same emitter as the annual archives; only the `year` property is added.
# A place lost in two years is drawn twice, once per year, which is what the
# annual archives already said about it. The union of what is drawn is the
# span's union of loss cells at the maximum zoom.
#
# Zoom policy follows build-phase2-per-cell-tiles.sh, with one addition:
# --extend-zooms-if-still-dropping. Thirty-eight years share every tile here,
# so a crowded tile at z14 could otherwise still shed its smallest patches;
# with the flag tippecanoe adds zoom levels until one holds every patch, and
# the archive header records the zoom it reached.
#
# Emitting reads one interval at a time by default, because the drive is a
# serial device. The intermediates and every tiler temporary file stay on the
# data root and are deleted once the archive exists.
#
# WITNESS_TREE_SPAN_STORE and WITNESS_TREE_SPAN_WORK point the build at a
# verified copy of the clipped store and a work directory elsewhere, and
# SPAN_EMIT_PARALLEL runs that many emits at once. They exist for an owner
# exception on 2026-09-19 that ran the build from internal scratch; the
# finished archive is always written to the data root.
set -euo pipefail

root="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
store="${WITNESS_TREE_SPAN_STORE:-$root/derived/phase2-per-cell-geometry-1984-2022-four-province-v1}"
work="${WITNESS_TREE_SPAN_WORK:-$root/work/per-cell-four-province-span-geojson}"
parallel="${SPAN_EMIT_PARALLEL:-1}"
out="$root/derived/phase2-per-cell-span-archive-four-province-v1"
mkdir -p "$work" "$out"
export WITNESS_TREE_PER_CELL_STORE="$store" WITNESS_TREE_PER_CELL_YEAR=1 TMPDIR="$work"

intervals=$(node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(manifest.intervals.map((entry) => entry.interval).join("\n"));
' "$store/manifest.json")

emit() {
  local interval="$1" file="$work/$1.geojsonl"
  [ -s "$file.done" ] && return 0
  node --max-old-space-size=4096 scripts/emit-phase2-per-cell-geojson.mjs "$interval" "$file" 2>"$work/$interval.emit.log" || return 1
  printf '%s\n' "$(tail -1 "$work/$interval.emit.log")" >"$file.done"
  printf 'emitted %s\n' "$interval"
}
export -f emit
export work
printf '%s\n' $intervals | xargs -P "$parallel" -I{} bash -c 'emit "$1"' _ {}

inputs=()
for interval in $intervals; do
  file="$work/$interval.geojsonl"
  [ -s "$file.done" ] || { printf 'no emit for %s\n' "$interval" >&2; exit 1; }
  inputs+=("$file")
done

# The tiler waits for anything else tiling on this machine, so two tiling
# jobs never split the cores or the drive between them.
while pgrep -f run-phase2-per-cell-four-province-tiles.sh >/dev/null; do sleep 60; done

started=$(date +%s)
rm -f "$work/spans.mbtiles" "$out/spans.pmtiles"
tippecanoe \
  --output="$work/spans.mbtiles" \
  --temporary-directory="$work" \
  --layer=spans \
  --minimum-zoom=8 \
  --maximum-zoom=14 \
  --drop-smallest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-simplification-of-shared-nodes \
  --preserve-input-order \
  --attribute-type=id:int \
  --attribute-type=cells:int \
  --attribute-type=harvest:int \
  --attribute-type=fire:int \
  --attribute-type=year:int \
  --read-parallel \
  "${inputs[@]}" 2>"$work/spans.tile.log"
pmtiles convert "$work/spans.mbtiles" "$out/spans.pmtiles"
pmtiles show "$out/spans.pmtiles" >"$out/spans.header.txt"
rm -f "$work/spans.mbtiles"
for file in "${inputs[@]}"; do rm -f "$file"; done
printf 'spans  %s  %ss\n' "$(du -h "$out/spans.pmtiles" | cut -f1)" "$(( $(date +%s) - started ))"
