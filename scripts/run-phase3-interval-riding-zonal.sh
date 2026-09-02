#!/usr/bin/env bash
# Builds the arbitrary-interval loss product for every federal and provincial
# electoral district in the four covered provinces.
#
# The annual product answers one year at a time. A reader who selects 1990 to
# 1998 needs two different answers: the union, which counts a twice-lost cell
# once and therefore carries a meaningful percentage, and the sum, which adds
# the annual areas and therefore carries none. Both come from one bounded pass
# per district; see scripts/phase3_interval_zonal_aggregate.py for the method.
#
# Five separate runs, not one merged boundary file, for the same reason the
# annual runner keeps them separate: five authorities publish five schemas, and
# merging them would mean recording a checksum for a file this project invented
# rather than for the bytes each authority published.
#
# Completion markers make the run restartable without ever overwriting a
# finished summary. A half-written output set is refused, not resumed, because
# a partial pass over a district is not a smaller measurement of it.
#
# NEVER edit this file while it is running. Bash reads a script by byte offset
# and will resume a running script at the wrong place.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
RASTERS="$DATA_ROOT/derived/phase2-real-national-1984-2022-v1"
EXTENT="$DATA_ROOT/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
OUT="$DATA_ROOT/derived/phase3-interval-riding-zonal-v1"
WORKER="$(cd "$(dirname "$0")" && pwd)/phase3_interval_zonal_aggregate.py"
METHOD_VERSION="interval-union-and-sum-1984-2022-v1"
CODE_VERSION="working-tree-$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD)"
WORKERS="${WITNESS_TREE_INTERVAL_WORKERS:-8}"
GDAL_CACHE_MB="${WITNESS_TREE_INTERVAL_GDAL_CACHE_MB:-96}"

if [ ! -e "$EXTENT" ]; then
  echo "missing mapped extent: $EXTENT" >&2
  exit 1
fi

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked interval output directory: $OUT" >&2
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
  echo "$(date +%H:%M:%S) starting $slug with $WORKERS workers"
  python3 "$WORKER" \
    --forest-mask-dir "$RASTERS/masks" \
    --annual-loss-dir "$RASTERS/loss" \
    --mapped-extent "$EXTENT" \
    --boundaries "$boundaries" \
    --boundary-id-field "$id_field" \
    --boundary-name-field "$name_field" \
    --jurisdiction "$jurisdiction" \
    --boundary-edition "$edition" \
    --method-version "$METHOD_VERSION" \
    --code-version "$CODE_VERSION" \
    --workers "$WORKERS" \
    --gdal-cache-megabytes "$GDAL_CACHE_MB" \
    --output "$output" \
    --sidecar "$sidecar"
  local digest
  digest="$(pair_digest "$output" "$sidecar")"
  (set -C; printf '%s\n' "$digest" > "$marker")
  echo "$(date +%H:%M:%S) finished $slug"
}

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

run_one federal-ridings-2023 CA \
  "$DATA_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg" \
  FED_NUM ED_NAMEE fed-2023-representation-order

echo "all five interval summaries complete"
