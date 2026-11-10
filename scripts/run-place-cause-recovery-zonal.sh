#!/usr/bin/env bash
# Measures recorded harvest and fire by year, cause of the latest loss and
# regrowth (treed again for five years) for every boundary the place pages
# cover, plus the four provinces from their own masks so the result can be
# held to the published province figures. See
# scripts/place_cause_recovery_zonal.py for the definitions.
#
# Seven runs, one per boundary file, in the order provinces, census
# subdivisions, federal ridings (the 280 in the four provinces), then the four
# provincial riding sets. Boundary files, id fields and editions are the ones
# the phase 3 place and riding runs used, so cells line up with those records.
#
# Rasters are read from INPUT_ROOT, which has the data root's layout. It
# defaults to the data root; a copy on the internal disk may be named instead,
# because the data-root volume reads at about 100 MB/s. The input digests are
# taken once, before the first run, from the files actually read. Boundary
# files are always read from the data root.
#
# Completion markers let a finished run be skipped on a later manual launch; a
# half-written output set is refused, never resumed. There is no retry loop.
#
# NEVER edit this file while it is running.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
INPUT_ROOT="${WITNESS_TREE_PLACE_CAUSE_INPUT_ROOT:-$DATA_ROOT}"
OUT="$DATA_ROOT/derived/place-cause-recovery-zonal-v1"
WORKER="$(cd "$(dirname "$0")" && pwd)/place_cause_recovery_zonal.py"
PYTHON="${WITNESS_TREE_PYTHON:-python3}"
METHOD_VERSION="place-cause-recovery-v3-classes-1984-2022-v1"
CODE_VERSION="working-tree-$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD)"
# Each worker holds about 1.3 GB: libtiff loads the whole tile index of every
# land-cover year it reads (about 25 MB for each of the 39). Four workers and
# the parent stay near 6 GB.
WORKERS="${WITNESS_TREE_PLACE_CAUSE_WORKERS:-4}"
GDAL_CACHE_MB="${WITNESS_TREE_PLACE_CAUSE_GDAL_CACHE_MB:-64}"

LC="$INPUT_ROOT/derived/bc-annual-series-20260909/lc"
DIST="$INPUT_ROOT/derived/bc-annual-series-20260909/rasters"
P2="$INPUT_ROOT/derived/phase2-real-national-1984-2022-v1"
EXTENT="$INPUT_ROOT/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
PROVINCIAL="$DATA_ROOT/derived/provincial-annual-series-20260909"
NOTE="Rasters read from $INPUT_ROOT; boundaries, province masks and windows from $DATA_ROOT."

if [ -L "$OUT" ]; then echo "refusing a symlinked output directory: $OUT" >&2; exit 1; fi
mkdir -p "$OUT"

DIGESTS="$OUT/input-digests.json"
if [ ! -e "$DIGESTS" ]; then
  inputs=("$P2/masks/forest-mask-1984.tif" "$EXTENT" "$DIST/CA_Forest_Harvest_1985-2022.tif" "$DIST/CA_Forest_Fire_1985-2022.tif")
  for year in $(seq 1984 2021); do inputs+=("$P2/loss/detected-forest-loss-$year-$((year + 1)).tif"); done
  for year in $(seq 1984 2022); do inputs+=("$LC/CA_forest_VLCE2_$year.tif"); done
  echo "$(date +%H:%M:%S) hashing ${#inputs[@]} rasters"
  "$PYTHON" -I "$WORKER" hash-inputs "$DIGESTS" "${inputs[@]}"
fi

pair_digest() {
  shasum -a 256 "$1" "$2" | shasum -a 256 | awk '{print $1}'
}

run_one() {
  local slug="$1"; shift
  local output="$OUT/$slug.json" sidecar="$OUT/$slug.provenance.json" marker="$OUT/$slug.complete.sha256"
  if [ -e "$output" ] && [ -e "$sidecar" ] && [ -e "$marker" ]; then
    if [ "$(tr -d '\n' < "$marker")" != "$(pair_digest "$output" "$sidecar")" ]; then
      echo "$slug completion marker does not match its output pair" >&2; return 1
    fi
    echo "$(date +%H:%M:%S) $slug already measured, left untouched"; return 0
  fi
  if [ -e "$output" ] || [ -e "$sidecar" ] || [ -e "$marker" ]; then
    echo "$slug has an incomplete output set; refusing to overwrite or skip it" >&2; return 1
  fi
  echo "$(date +%H:%M:%S) starting $slug with $WORKERS workers"
  /usr/bin/time -l "$PYTHON" -I "$WORKER" "$@" \
    --lc-dir "$LC" \
    --harvest "$DIST/CA_Forest_Harvest_1985-2022.tif" \
    --fire "$DIST/CA_Forest_Fire_1985-2022.tif" \
    --forest-mask-dir "$P2/masks" \
    --annual-loss-dir "$P2/loss" \
    --mapped-extent "$EXTENT" \
    --method-version "$METHOD_VERSION" \
    --code-version "$CODE_VERSION" \
    --input-digests "$DIGESTS" \
    --inputs-note "$NOTE" \
    --workers "$WORKERS" \
    --gdal-cache-megabytes "$GDAL_CACHE_MB" \
    --output "$output" \
    --sidecar "$sidecar"
  (set -C; printf '%s\n' "$(pair_digest "$output" "$sidecar")" > "$marker")
  echo "$(date +%H:%M:%S) finished $slug"
}

run_one provinces-2021 --boundary-set provinces --jurisdiction CA \
  --boundary-edition "Statistics Canada 2021 provincial boundary file" \
  --province-windows "$PROVINCIAL/province-windows.json" --province-mask-dir "$PROVINCIAL/masks"

run_one census-subdivisions-2021 --boundary-set csd --jurisdiction CA \
  --boundaries "$DATA_ROOT/derived/phase3-interval-place-zonal-v1/csd-four-province-2021.gpkg" \
  --boundary-id-field CSDUID --boundary-name-field CSDNAME \
  --boundary-edition statcan-2021-census-subdivisions-cbf

run_one federal-ridings-2023 --boundary-set federal --jurisdiction CA \
  --boundaries "$DATA_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg" \
  --boundary-id-field FED_NUM --boundary-name-field ED_NAMEE --id-prefixes 59,48,35,24 \
  --boundary-edition fed-2023-representation-order

run_one bc-provincial-ridings-2023 --boundary-set bc --jurisdiction BC \
  --boundaries "$DATA_ROOT/staging/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson" \
  --boundary-id-field ELECTORAL_DISTRICT_ID --boundary-name-field ED_NAME \
  --boundary-edition bc-electoral-districts-2023

run_one ab-provincial-ridings-2019-goa --boundary-set ab --jurisdiction AB \
  --boundaries "$DATA_ROOT/raw/alberta-provincial-electoral-divisions-2019/2026-09-18/provincial-electoral-division-current-2019.geojson" \
  --boundary-id-field EDNUMBER --boundary-name-field EDNAME \
  --boundary-edition ab-electoral-divisions-2019

run_one on-provincial-ridings-2022 --boundary-set on --jurisdiction ON \
  --boundaries "/vsizip/$DATA_ROOT/staging/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip/Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp" \
  --boundary-id-field ED_ID --boundary-name-field ENGLISH_NA \
  --boundary-edition on-electoral-districts-2022

run_one qc-provincial-ridings-2026-published --boundary-set qc --jurisdiction QC \
  --boundaries "$DATA_ROOT/staging/qc-electoral-2026/qc-electoral-2026.geojson" \
  --boundary-id-field CO_CEP --boundary-name-field NM_CEP \
  --boundary-edition qc-electoral-districts-2026

echo "all seven place cause and recovery measurements complete"
