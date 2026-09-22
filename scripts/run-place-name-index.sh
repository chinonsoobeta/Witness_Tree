#!/usr/bin/env bash
# Builds the place-name index: every community in British Columbia, Alberta,
# Ontario and Quebec, with the ridings that hold it.
#
# Two stages, each written once into one run directory on the data drive:
#
#   overlaps  every census subdivision intersected with every riding it can
#             touch (scripts/place_name_overlaps.py); geometry only
#   index     which places to list and which overlaps to name
#             (scripts/place_name_index.py)
#
# A stage that finished leaves a completion marker holding its manifest's
# digest and is skipped on a later run; a half-written stage is refused rather
# than resumed or overwritten.  Pass "overlaps" to run only the first stage.
#
# The layer list is written here rather than committed, because it names
# absolute paths on the data drive and those are not repository facts.  The
# overlap stage checks every path and digest in it against
# data/phase6-district-index.json before reading a byte of geometry.
set -euo pipefail

ONLY="${1:-all}"
if [ "$ONLY" != "all" ] && [ "$ONLY" != "overlaps" ]; then
  echo "usage: $0 [overlaps]" >&2
  exit 64
fi

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SUBDIVISIONS="/vsizip/$DATA_ROOT/raw/statcan-boundaries/2026-08-12/lcsd000b21a_e.zip"
STAGING="$DATA_ROOT/staging"
FEDERAL="$DATA_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg"
RIDING_FIGURES="$DATA_ROOT/derived/phase3-interval-riding-zonal-v1"
# Statistics Canada's classification pages for the same subdivisions, read in
# English and French: the names in both languages and the type labels.
NAMES="$DATA_ROOT/raw/statcan-sgc-2021-classification/2026-09-21/sgc-2021-csd-names.json"
OUT="$DATA_ROOT/derived/place-name-index-v1"
# GIT can name a git binary directly, for a machine whose default one is a
# shim that will not run.
CODE_VERSION="working-tree-$("${GIT:-git}" -C "$REPO" rev-parse --short=12 HEAD)"

for input in "${SUBDIVISIONS#/vsizip/}" "$FEDERAL" "$RIDING_FIGURES" "$NAMES"; do
  if [ ! -e "$input" ]; then
    echo "missing input: $input" >&2
    exit 1
  fi
done

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked output directory: $OUT" >&2
  exit 1
fi

# Returns 0 when the stage is complete, 1 when it has not started, and stops
# the script when it is half-written or its marker disagrees with its manifest.
stage_state() {
  local manifest="$1" marker="$2"
  if [ -L "$manifest" ] || [ -L "$marker" ]; then
    echo "a manifest or completion marker is a symlink: $manifest" >&2
    exit 1
  fi
  if [ -e "$manifest" ] && [ -e "$marker" ]; then
    local recorded actual
    recorded="$(tr -d '\n' < "$marker")"
    actual="$(shasum -a 256 "$manifest" | awk '{print $1}')"
    if [ "$recorded" != "$actual" ]; then
      echo "the completion marker does not match its manifest: $manifest" >&2
      exit 1
    fi
    return 0
  fi
  if [ -e "$manifest" ] || [ -e "$marker" ]; then
    echo "a stage is half-written; refusing to overwrite or skip it: $manifest" >&2
    exit 1
  fi
  return 1
}

complete_stage() {
  local manifest="$1" marker="$2" digest
  digest="$(shasum -a 256 "$manifest" | awk '{print $1}')"
  (set -C; printf '%s\n' "$digest" > "$marker")
}

LAYERS="$OUT/layers.json"
LAYER_LIST="$(cat <<JSON
[
  {"id": "federal-2023", "jurisdiction": "CA", "path": "$FEDERAL",
   "layer": "federal_electoral_districts_2023", "idField": "FED_NUM"},
  {"id": "bc-2023", "jurisdiction": "BC", "province": "59",
   "path": "$STAGING/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson",
   "idField": "ELECTORAL_DISTRICT_ID"},
  {"id": "ab-2019", "jurisdiction": "AB", "province": "48",
   "path": "$DATA_ROOT/raw/alberta-provincial-electoral-divisions-2019/2026-09-18/provincial-electoral-division-current-2019.geojson",
   "idField": "EDNUMBER"},
  {"id": "on-2022", "jurisdiction": "ON", "province": "35",
   "path": "/vsizip/$STAGING/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip/Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp",
   "idField": "ED_ID"},
  {"id": "qc-2026", "jurisdiction": "QC", "province": "24",
   "path": "$STAGING/qc-electoral-2026/qc-electoral-2026.geojson",
   "idField": "CO_CEP"}
]
JSON
)"
if [ -e "$LAYERS" ]; then
  if [ "$(cat "$LAYERS")" != "$LAYER_LIST" ]; then
    echo "an earlier run wrote a different layer list: $LAYERS" >&2
    exit 1
  fi
else
  (set -C; printf '%s\n' "$LAYER_LIST" > "$LAYERS")
fi

OVERLAPS_MANIFEST="$OUT/overlaps.manifest.json"
OVERLAPS_MARKER="$OUT/overlaps.complete.sha256"
if stage_state "$OVERLAPS_MANIFEST" "$OVERLAPS_MARKER"; then
  echo "overlaps already built, left untouched"
else
  if [ -e "$OUT/subdivisions.jsonl" ] || [ -e "$OUT/overlaps.jsonl" ]; then
    echo "overlap outputs exist without a manifest; refusing to overwrite them" >&2
    exit 1
  fi
  echo "$(date +%H:%M:%S) computing overlaps"
  python3 "$REPO/scripts/place_name_overlaps.py" \
    --subdivisions "$SUBDIVISIONS" \
    --editions "$REPO/data/boundary-editions.json" \
    --district-index "$REPO/data/phase6-district-index.json" \
    --layers "$LAYERS" \
    --output "$OUT" \
    --manifest "$OVERLAPS_MANIFEST" \
    --code-version "$CODE_VERSION"
  complete_stage "$OVERLAPS_MANIFEST" "$OVERLAPS_MARKER"
  echo "$(date +%H:%M:%S) overlaps complete"
fi

if [ "$ONLY" = "overlaps" ]; then
  exit 0
fi

INDEX_MANIFEST="$OUT/place-name-index.manifest.json"
INDEX_MARKER="$OUT/place-name-index.complete.sha256"
if stage_state "$INDEX_MANIFEST" "$INDEX_MARKER"; then
  echo "index already built, left untouched"
else
  if [ -e "$OUT/place-name-index.json" ]; then
    echo "an index exists without a manifest; refusing to overwrite it" >&2
    exit 1
  fi
  echo "$(date +%H:%M:%S) building the index"
  python3 "$REPO/scripts/place_name_index.py" \
    --overlaps-manifest "$OVERLAPS_MANIFEST" \
    --editions "$REPO/data/boundary-editions.json" \
    --owner-decision "$REPO/data/phase2-real-data-owner-decision.json" \
    --measurements "$REPO/data/phase3-riding-interval-measurements.json" \
    --riding-figures "$RIDING_FIGURES" \
    --names "$NAMES" \
    --output "$OUT" \
    --manifest "$INDEX_MANIFEST" \
    --code-version "$CODE_VERSION"
  complete_stage "$INDEX_MANIFEST" "$INDEX_MARKER"
  echo "$(date +%H:%M:%S) index complete"
fi
