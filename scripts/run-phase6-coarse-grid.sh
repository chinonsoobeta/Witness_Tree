#!/usr/bin/env bash
# Builds the countable coarse grid that answers a drawn shape.
#
# One national pass. The tiles cannot be counted and the worker cannot open a
# raster, so a drawn shape can only be answered from something precomputed;
# see scripts/phase6_coarse_grid_aggregate.py for what a block stores and why
# it is enough to answer any window exactly.
#
# Worker count is set by memory, not by core count. Each worker holds two
# uint64 bit planes over an 8.4 million cell strip, and the drive does not
# scale with parallel readers, so more readers would be slower rather than
# faster.
#
# The output is written once and never overwritten. A finished run leaves a
# completion marker; a half-written one is refused rather than resumed,
# because a partial pass over the country is not a smaller measurement of it.
#
# NEVER edit this file while it is running. Bash reads a script by byte offset
# and will resume a running script at the wrong place.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
RASTERS="$DATA_ROOT/derived/phase2-real-national-1984-2022-v1"
EXTENT="$DATA_ROOT/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
OUT="$DATA_ROOT/derived/phase6-coarse-grid-v1"
WORKER="$(cd "$(dirname "$0")" && pwd)/phase6_coarse_grid_aggregate.py"
METHOD_VERSION="coarse-grid-960m-union-and-sum-1984-2022-v1"
CODE_VERSION="working-tree-$(git -C "$(dirname "$0")/.." rev-parse --short=12 HEAD)"
WORKERS="${WITNESS_TREE_GRID_WORKERS:-5}"
GDAL_CACHE_MB="${WITNESS_TREE_GRID_GDAL_CACHE_MB:-192}"
STRIP_ROWS="${WITNESS_TREE_GRID_STRIP_ROWS:-16}"
STRIP_COLUMNS="${WITNESS_TREE_GRID_STRIP_COLUMNS:-512}"

if [ ! -e "$EXTENT" ]; then
  echo "missing mapped extent: $EXTENT" >&2
  exit 1
fi

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked grid output directory: $OUT" >&2
  exit 1
fi

BLOCKS="$OUT/blocks.jsonl"
SIDECAR="$OUT/blocks.provenance.json"
MARKER="$OUT/blocks.complete.sha256"

if [ -L "$BLOCKS" ] || [ -L "$SIDECAR" ] || [ -L "$MARKER" ]; then
  echo "the grid output, sidecar, or completion marker is a symlink" >&2
  exit 1
fi

if [ -e "$BLOCKS" ] && [ -e "$SIDECAR" ] && [ -e "$MARKER" ]; then
  recorded="$(tr -d '\n' < "$MARKER")"
  actual="$(shasum -a 256 "$BLOCKS" "$SIDECAR" | shasum -a 256 | awk '{print $1}')"
  if [ "$recorded" != "$actual" ]; then
    echo "the grid completion marker does not match its output pair" >&2
    exit 1
  fi
  echo "coarse grid already built, left untouched"
  exit 0
fi

if [ -e "$BLOCKS" ] || [ -e "$SIDECAR" ] || [ -e "$MARKER" ]; then
  echo "the grid output set is incomplete; refusing to overwrite or skip it" >&2
  exit 1
fi

echo "$(date +%H:%M:%S) starting the coarse grid with $WORKERS workers"
python3 "$WORKER" \
  --forest-mask-dir "$RASTERS/masks" \
  --annual-loss-dir "$RASTERS/loss" \
  --mapped-extent "$EXTENT" \
  --method-version "$METHOD_VERSION" \
  --code-version "$CODE_VERSION" \
  --workers "$WORKERS" \
  --gdal-cache-megabytes "$GDAL_CACHE_MB" \
  --strip-rows "$STRIP_ROWS" \
  --strip-columns "$STRIP_COLUMNS" \
  --output "$BLOCKS" \
  --sidecar "$SIDECAR"

digest="$(shasum -a 256 "$BLOCKS" "$SIDECAR" | shasum -a 256 | awk '{print $1}')"
(set -C; printf '%s\n' "$digest" > "$MARKER")
echo "$(date +%H:%M:%S) coarse grid complete"
