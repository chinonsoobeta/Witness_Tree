#!/usr/bin/env bash
# Stage 5: one interval of per-cell geometry becomes one PMTiles archive.
#
# Zoom policy, mirroring data/phase2-per-cell-geometry-method.json:
#   z0-7    not built here. The existing province and national aggregates
#           already answer those zooms, and individual 30 m patches are not
#           drawable there.
#   z8-13   generalized for drawing. tippecanoe simplifies and, where a tile
#           would otherwise be unusable, drops the smallest features. These
#           zooms are presentation only: they are drawable, not countable.
#   z14     the maximum zoom, which tippecanoe leaves unsimplified. Features
#           are still quantized to the tile grid, about 0.6 m at this zoom,
#           which is a fiftieth of a cell.
#
# The authoritative product is the run store, not these tiles. Nothing
# downstream may count area from a tile.
set -euo pipefail

interval="${1:?usage: build-phase2-per-cell-tiles.sh <interval-name> <geojson> <out.pmtiles>}"
input="${2:?missing geojson}"
output="${3:?missing output}"
layer="$(printf '%s' "$interval" | tr '-' '_')"
work="${TMPDIR:-/tmp}/${interval}.mbtiles"

rm -f "$work" "$output"
tippecanoe \
  --output="$work" \
  --layer="$layer" \
  --minimum-zoom=8 \
  --maximum-zoom=14 \
  --drop-smallest-as-needed \
  --no-simplification-of-shared-nodes \
  --preserve-input-order \
  --attribute-type=id:int \
  --attribute-type=cells:int \
  --attribute-type=harvest:int \
  --attribute-type=fire:int \
  --read-parallel \
  --quiet \
  "$input"

pmtiles convert "$work" "$output"
rm -f "$work"
printf '%s  %s\n' "$interval" "$(du -h "$output" | cut -f1)"
