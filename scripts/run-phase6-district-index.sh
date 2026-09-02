#!/usr/bin/env bash
# Builds the 960 m district index that resolves a point to its district.
#
# A point cannot be tested against a polygon in the worker, and the boundary
# tiles are generalized, so the answer has to be precomputed on the same block
# grid the shape product uses.  See scripts/phase6_district_index.py for the
# encoding and for why a block on a boundary names its candidates instead of
# picking one.
#
# The layer list is written here rather than committed, because it names
# absolute paths on the data drive and those are not repository facts.
#
# The output is written once and never overwritten.  A finished run leaves a
# completion marker; a half-written one is refused rather than resumed.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
REFERENCE="$DATA_ROOT/derived/phase2-real-national-1984-2022-v1/masks/forest-mask-1984.tif"
STAGING="$DATA_ROOT/staging"
FEDERAL="$DATA_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg"
OUT="$DATA_ROOT/derived/phase6-district-index-v1"
BUILDER="$(cd "$(dirname "$0")" && pwd)/phase6_district_index.py"
METHOD_VERSION="district-index-960m-all-touched-v1"
CODE_VERSION="working-tree-$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD)"

if [ ! -e "$REFERENCE" ]; then
  echo "missing reference raster: $REFERENCE" >&2
  exit 1
fi
if [ ! -e "$FEDERAL" ]; then
  echo "missing federal district geometry: $FEDERAL" >&2
  exit 1
fi

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked index output directory: $OUT" >&2
  exit 1
fi

MANIFEST="$OUT/district-index.manifest.json"
MARKER="$OUT/district-index.complete.sha256"

if [ -L "$MANIFEST" ] || [ -L "$MARKER" ]; then
  echo "the index manifest or completion marker is a symlink" >&2
  exit 1
fi

if [ -e "$MANIFEST" ] && [ -e "$MARKER" ]; then
  recorded="$(tr -d '\n' < "$MARKER")"
  actual="$(shasum -a 256 "$MANIFEST" | awk '{print $1}')"
  if [ "$recorded" != "$actual" ]; then
    echo "the district index completion marker does not match its manifest" >&2
    exit 1
  fi
  echo "district index already built, left untouched"
  exit 0
fi

if [ -e "$MANIFEST" ] || [ -e "$MARKER" ]; then
  echo "the district index output set is incomplete; refusing to overwrite or skip it" >&2
  exit 1
fi

LAYERS="$OUT/layers.json"
cat > "$LAYERS" <<JSON
[
  {"id": "federal-2023", "path": "$FEDERAL",
   "layer": "federal_electoral_districts_2023",
   "idField": "FED_NUM", "nameFieldEn": "ED_NAMEE", "nameFieldFr": "ED_NAMEF"},
  {"id": "bc-2023", "path": "$STAGING/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson",
   "idField": "ELECTORAL_DISTRICT_ID", "nameFieldEn": "ED_NAME", "nameFieldFr": "ED_NAME"},
  {"id": "ab-2019", "path": "$STAGING/ab-electoral-2019/EDS_ENACTED_BILL33_15DEC2017.shp",
   "idField": "EDNumber20", "nameFieldEn": "EDName2017", "nameFieldFr": "EDName2017"},
  {"id": "on-2022", "path": "/vsizip/$STAGING/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip/Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp",
   "idField": "ED_ID", "nameFieldEn": "ENGLISH_NA", "nameFieldFr": "FRENCH_NAM"},
  {"id": "qc-2026", "path": "$STAGING/qc-electoral-2026-sanseau/qc-electoral-districts-2026-sans-eau.geojson",
   "idField": "CO_CEP", "nameFieldEn": "NM_CEP", "nameFieldFr": "NM_CEP"}
]
JSON

echo "$(date +%H:%M:%S) building the district index"
python3 "$BUILDER" \
  --reference-raster "$REFERENCE" \
  --layers "$LAYERS" \
  --output "$OUT" \
  --manifest "$MANIFEST" \
  --method-version "$METHOD_VERSION" \
  --code-version "$CODE_VERSION"

digest="$(shasum -a 256 "$MANIFEST" | awk '{print $1}')"
(set -C; printf '%s\n' "$digest" > "$MARKER")
echo "$(date +%H:%M:%S) district index complete"
