#!/usr/bin/env bash
# Proves the pair identity, then packs the coarse grid into shippable tiles.
#
# The order is deliberate. The identity is what makes a drawn shape answerable
# from blocks at all, so it is checked against the independent national
# histogram before anything is packed. A grid that failed the check is not
# packed, because the tiles would be a faster way to be wrong.
#
# See scripts/phase6_prove_pair_identity.py for what the check compares, and
# scripts/phase6_pack_coarse_grid.py for the tile layout.
#
# The output is written once and never overwritten. A finished run leaves a
# completion marker; a half-written one is refused rather than resumed.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
GRID="$DATA_ROOT/derived/phase6-coarse-grid-v1"
OUT="$DATA_ROOT/derived/phase6-coarse-grid-tiles-v1"
HERE="$(cd "$(dirname "$0")" && pwd)"

BLOCKS="$GRID/blocks.jsonl"
SIDECAR="$GRID/blocks.provenance.json"
GRID_MARKER="$GRID/blocks.complete.sha256"

if [ ! -e "$GRID_MARKER" ]; then
  echo "the coarse grid has no completion marker; it is not finished" >&2
  exit 1
fi
recorded="$(tr -d '\n' < "$GRID_MARKER")"
actual="$(shasum -a 256 "$BLOCKS" "$SIDECAR" | shasum -a 256 | awk '{print $1}')"
if [ "$recorded" != "$actual" ]; then
  echo "the coarse grid does not match its own completion marker" >&2
  exit 1
fi

mkdir -p "$OUT"
if [ -L "$OUT" ]; then
  echo "refusing a symlinked tile output directory: $OUT" >&2
  exit 1
fi

MANIFEST="$OUT/tiles.manifest.json"
INDEX="$OUT/tiles.index.json"
REPORT="$OUT/pair-identity.json"
MARKER="$OUT/tiles.complete.sha256"
TILES="$OUT/tiles"

if [ -e "$MANIFEST" ] && [ -e "$MARKER" ]; then
  marked="$(tr -d '\n' < "$MARKER")"
  now="$(shasum -a 256 "$MANIFEST" "$INDEX" "$REPORT" | shasum -a 256 | awk '{print $1}')"
  if [ "$marked" != "$now" ]; then
    echo "the tile completion marker does not match its manifest set" >&2
    exit 1
  fi
  echo "coarse grid tiles already built, left untouched"
  exit 0
fi

if [ -e "$MANIFEST" ] || [ -e "$MARKER" ] || [ -e "$INDEX" ]; then
  echo "the tile output set is incomplete; refusing to overwrite or skip it" >&2
  exit 1
fi

echo "$(date +%H:%M:%S) proving the pair identity over all 741 windows"
python3 "$HERE/phase6_prove_pair_identity.py" \
  --blocks "$BLOCKS" \
  --sidecar "$SIDECAR" \
  --report "$REPORT"

echo "$(date +%H:%M:%S) hashing the source blocks"
BLOCKS_SHA="$(shasum -a 256 "$BLOCKS" | awk '{print $1}')"

echo "$(date +%H:%M:%S) packing tiles"
mkdir -p "$TILES"
python3 "$HERE/phase6_pack_coarse_grid.py" \
  --blocks "$BLOCKS" \
  --sidecar "$SIDECAR" \
  --blocks-sha256 "$BLOCKS_SHA" \
  --output "$TILES" \
  --manifest "$MANIFEST" \
  --tile-index "$INDEX"

digest="$(shasum -a 256 "$MANIFEST" "$INDEX" "$REPORT" | shasum -a 256 | awk '{print $1}')"
(set -C; printf '%s\n' "$digest" > "$MARKER")
echo "$(date +%H:%M:%S) coarse grid tiles complete"
