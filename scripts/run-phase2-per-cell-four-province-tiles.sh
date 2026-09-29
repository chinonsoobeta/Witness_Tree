#!/usr/bin/env bash
# Tiles the four-province per-cell store: the same emitter and tiler as the
# national archives, pointed at the clipped store.
#
# Several intervals run at once. Emitting is one core per interval and the
# tiler spreads over the rest, while the SSD reads the small clipped store far
# faster than either can use it. PARALLEL sets how many intervals are in
# flight; each holds one GeoJSON intermediate, deleted once its tiles exist.
# Temporary files stay on the data root, never on the internal drive.
set -euo pipefail

root="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
store="$root/derived/phase2-per-cell-geometry-1984-2022-four-province-v1"
work="$root/work/per-cell-four-province-geojson"
tiles="$store/tiles"
parallel="${PARALLEL:-3}"
mkdir -p "$work" "$tiles"
export WITNESS_TREE_PER_CELL_STORE="$store" TMPDIR="$work" store work tiles

one() {
  interval="$1"
  # A missing data root means the drive dropped off the bus. Exit 255 stops
  # xargs outright instead of letting every remaining interval fail in turn
  # and report itself built.
  [ -d "$store" ] || exit 255
  if [ -s "$tiles/$interval.pmtiles" ]; then
    printf 'skip %s (already built)\n' "$interval"
    return 0
  fi
  started=$(date +%s)
  # The tiler writes its archive in place, so a failed step removes the partial
  # archive: a non-empty file here must only ever be a finished one.
  if ! node --max-old-space-size=4096 scripts/emit-phase2-per-cell-geojson.mjs "$interval" "$work/$interval.geojsonl" 2>"$work/$interval.emit.log" ||
    ! ./scripts/build-phase2-per-cell-tiles.sh "$interval" "$work/$interval.geojsonl" "$tiles/$interval.pmtiles" >/dev/null 2>"$work/$interval.tile.log"; then
    rm -f "$tiles/$interval.pmtiles"
    [ -d "$store" ] || exit 255
    printf '%s  FAILED\n' "$interval"
    return 1
  fi
  rm -f "$work/$interval.geojsonl"
  printf '%s  %s  %ss\n' "$interval" "$(du -h "$tiles/$interval.pmtiles" | cut -f1)" "$(( $(date +%s) - started ))"
}
export -f one

node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(manifest.intervals.map((entry) => entry.interval).join("\n"));
' "$store/manifest.json" | xargs -P "$parallel" -I{} bash -c 'one "$@"' _ {}

printf 'all intervals tiled\n'
