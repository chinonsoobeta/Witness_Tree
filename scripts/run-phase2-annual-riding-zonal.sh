#!/usr/bin/env bash
# Summarizes the annual loss series inside every federal and provincial
# electoral district, using the bounded raster-first worker.
#
# This runs the v2 worker, which reads the land-cover product's mapped extent
# alongside the forest and loss rasters. The v1 outputs in
# phase2-annual-riding-zonal-v1 are kept exactly as they were run: they are the
# evidence that the defect was real, not a draft to be overwritten. They must
# not reach the site, because every district outside the mapped extent came
# back as a complete measurement of zero loss when in fact nobody looked.
#
# Five separate runs rather than one merged boundary file. The five sources are
# published by five different authorities with different identifier and name
# fields, and merging them would mean inventing a common schema and then
# recording a checksum for a file this project created rather than for the
# bytes each authority published. Five runs keep every row traceable to the
# exact source archive it came from.
#
# NEVER edit this file while it is running. Bash reads a script by byte offset
# and will resume a running script at the wrong place, which is how the tiler
# crashed and silently redid an epoch on 2026-08-29.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
RASTERS="$DATA_ROOT/derived/phase2-real-national-1984-2022-v1"
EXTENT="$DATA_ROOT/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
OUT="$DATA_ROOT/derived/phase2-annual-riding-zonal-v2"
WORKER="$(cd "$(dirname "$0")" && pwd)/phase2_annual_zonal_aggregate_v2.py"
CODE_VERSION="working-tree-$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD)"

if [ ! -e "$EXTENT" ]; then
  echo "missing mapped extent: $EXTENT" >&2
  echo "build it with scripts/build_phase2_vlce2_mapped_extent.py --verify first" >&2
  exit 1
fi

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked riding v2 output directory: $OUT" >&2
  exit 1
fi

pair_digest() {
  shasum -a 256 "$1" "$2" | shasum -a 256 | awk '{print $1}'
}

run_one() {
  local slug="$1" jurisdiction="$2" boundaries="$3" id_field="$4" name_field="$5" edition="$6"
  local output="$OUT/$slug.json" sidecar="$OUT/$slug.provenance.json" marker="$OUT/$slug.complete.sha256"
  if [ -L "$output" ] || [ -L "$sidecar" ] || [ -L "$marker" ]; then
    echo "$slug has a symlinked output, sidecar, or completion marker" >&2
    return 1
  fi
  if [ -e "$output" ] && [ -e "$sidecar" ] && [ -e "$marker" ]; then
    local recorded actual
    recorded="$(tr -d '\n' < "$marker")"
    actual="$(pair_digest "$output" "$sidecar")"
    if [ "$recorded" != "$actual" ]; then
      echo "$slug completion marker does not match its output pair" >&2
      return 1
    fi
    echo "$(date +%H:%M:%S) $slug already summarized, left untouched"
    return 0
  fi
  if [ -e "$output" ] || [ -e "$sidecar" ] || [ -e "$marker" ]; then
    echo "$slug has an incomplete output set; refusing to overwrite or skip it" >&2
    return 1
  fi
  echo "$(date +%H:%M:%S) starting $slug"
  python3 "$WORKER" \
    --forest-mask-dir "$RASTERS/masks" \
    --annual-loss-dir "$RASTERS/loss" \
    --mapped-extent "$EXTENT" \
    --boundaries "$boundaries" \
    --boundary-id-field "$id_field" \
    --boundary-name-field "$name_field" \
    --all-features \
    --jurisdiction "$jurisdiction" \
    --output "$output" \
    --sidecar "$sidecar" \
    --boundary-edition "$edition" \
    --boundary-classification authoritative-boundary \
    --forest-mask-version phase2-real-national-1984-2022-v1 \
    --change-raster-version phase2-real-national-1984-2022-v1 \
    --time-version annual-1984-baseline-plus-1985-2022-intervals-v1 \
    --source-version ntems-annual-land-cover-historical-batch-2026-08-12 \
    --code-version "$CODE_VERSION"
  local digest
  digest="$(pair_digest "$output" "$sidecar")"
  (set -C; printf '%s\n' "$digest" > "$marker")
  echo "$(date +%H:%M:%S) finished $slug"
}

run_one federal-ridings-2023 CA \
  "$DATA_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg" \
  FED_NUM ED_NAMEE fed-2023-representation-order

run_one bc-provincial-ridings-2023 BC \
  "$DATA_ROOT/staging/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson" \
  ELECTORAL_DISTRICT_ID ED_NAME bc-electoral-districts-2023

run_one ab-provincial-ridings-2019 AB \
  "$DATA_ROOT/staging/ab-electoral-2019/EDS_ENACTED_BILL33_15DEC2017.shp" \
  EDNumber20 EDName2017 ab-electoral-divisions-2019

run_one on-provincial-ridings-2022 ON \
  "/vsizip/$DATA_ROOT/staging/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip/Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp" \
  ED_ID ENGLISH_NA on-electoral-districts-2022

run_one qc-provincial-ridings-2026 QC \
  "$DATA_ROOT/staging/qc-electoral-2026-sanseau/qc-electoral-districts-2026-sans-eau.geojson" \
  CO_CEP NM_CEP qc-electoral-districts-2026

echo "all five district summaries complete"
