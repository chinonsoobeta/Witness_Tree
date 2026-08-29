#!/usr/bin/env bash
# Uploads each built tile archive to a staging prefix as soon as it is
# finished, so the network work overlaps the tiling instead of following it.
#
# The release id is the digest of every archive's digest, so the published
# path cannot be known until the last archive exists. Staging first and then
# copying server-side into the release prefix keeps the published path
# derived from the bytes while still using the hours the tiler is busy.
#
# An archive is only uploaded once its size has been stable across two polls
# and the tiler is no longer holding it open, so a partially written file is
# never staged.
set -euo pipefail

DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
TILES="$DATA_ROOT/derived/phase2-per-cell-geometry-1984-2022-v1/tiles"
BUCKET="s3://witness-tree-public-delivery-ca-central-1"
STAGING="$BUCKET/staging/phase2-per-cell-geometry-v1/tiles"
EXPECTED=38

staged=0
while :; do
  for file in "$TILES"/*.pmtiles; do
    [ -e "$file" ] || continue
    name="$(basename "$file")"
    if aws s3 ls "$STAGING/$name" >/dev/null 2>&1; then continue; fi
    if lsof -- "$file" >/dev/null 2>&1; then continue; fi
    first=$(stat -f %z "$file"); sleep 5; second=$(stat -f %z "$file")
    [ "$first" = "$second" ] || continue
    echo "$(date +%H:%M:%S) staging $name ($((second / 1000000)) MB)"
    aws s3 cp "$file" "$STAGING/$name" --only-show-errors
    echo "$(date +%H:%M:%S) staged $name"
  done
  staged=$(aws s3 ls "$STAGING/" | grep -c '\.pmtiles$' || true)
  echo "$(date +%H:%M:%S) $staged/$EXPECTED staged"
  [ "$staged" -ge "$EXPECTED" ] && break
  sleep 60
done
echo "all $EXPECTED archives staged"
