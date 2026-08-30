#!/usr/bin/env bash
# Recomputes the four-province annual summary with the mapped product extent.
# The v1 aggregate is retained as historical evidence and is never overwritten.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
RASTERS="$DATA_ROOT/derived/phase2-real-national-1984-2022-v1"
EXTENT="$DATA_ROOT/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
BOUNDARIES="/vsizip/$DATA_ROOT/raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip/lpr_000b21a_e.shp"
OUT_DIR="$DATA_ROOT/derived/phase2-annual-province-zonal-v2"
OUTPUT="$OUT_DIR/annual-province-zonal-1984-2022.json"
SIDECAR="$OUT_DIR/annual-province-zonal-1984-2022.provenance.json"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER="$REPO_ROOT/scripts/phase2_annual_zonal_aggregate_v2.py"
CODE_VERSION="working-tree-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"

if [ ! -e "$EXTENT" ]; then
  echo "missing mapped extent: $EXTENT" >&2
  exit 1
fi
if [ -L "$OUT_DIR" ] || [ -L "$OUTPUT" ] || [ -L "$SIDECAR" ]; then
  echo "refusing a symlinked province v2 output path" >&2
  exit 1
fi
if [ -e "$OUTPUT" ] || [ -e "$SIDECAR" ]; then
  echo "refusing to replace an existing province v2 artifact in $OUT_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
python3 "$WORKER" \
  --forest-mask-dir "$RASTERS/masks" \
  --annual-loss-dir "$RASTERS/loss" \
  --mapped-extent "$EXTENT" \
  --boundaries "$BOUNDARIES" \
  --boundary-id-field PRUID \
  --boundary-name-field PRENAME \
  --boundary-edition 2021-Census-cartographic-boundary \
  --boundary-classification illustrative \
  --forest-mask-version phase2-real-national-1984-2022-v1 \
  --change-raster-version phase2-real-national-1984-2022-v1 \
  --time-version annual-1984-baseline-plus-1985-2022-intervals-v1 \
  --source-version ntems-annual-land-cover-historical-batch-2026-08-12 \
  --code-version "$CODE_VERSION" \
  --output "$OUTPUT" \
  --sidecar "$SIDECAR"

echo "four-province v2 summary complete: $OUTPUT"
