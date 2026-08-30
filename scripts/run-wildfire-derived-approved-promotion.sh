#!/bin/zsh
# Owner-local only. Proposed distinct role: WitnessTreeWildfireDerivedPromotionUploader.
# This contract intentionally has no AWS/IAM authority yet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
[[ $# -le 1 && ( $# -eq 0 || "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 [--preflight|--run]" 64
node "$ROOT/scripts/prepare-wildfire-derived-immutable-promotion.mjs" >/dev/null
typeset -a FILES BYTES SHAS
FILES=("$DATA_ROOT/derived/bc-wildfire-geometry-policy-v1/2026-08-14/bc-wildfire-216-feature-release.gpkg" "$DATA_ROOT/derived/ontario-in-year-fire-geometry-policy-v1/2026-08-14/ontario-in-year-fire-perimeters-188-feature-derived.gpkg")
BYTES=(2162688 7913472)
SHAS=(8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce 5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31)
for i in {1..2}; do [[ -f "${FILES[$i]}" && "$(stat -f %z "${FILES[$i]}")" == "${BYTES[$i]}" && "$(shasum -a 256 "${FILES[$i]}" | awk '{print $1}')" == "${SHAS[$i]}" ]] || fail "Approved derived artifact drifted or is missing; no TOTP or AWS call was made" 65; done
print -- "PRECHECK passed: exact BC 216-feature and Ontario 188-feature derived artifacts are local; no TOTP or AWS call was made."
[[ "${1:-}" == "--run" ]] && fail "No derived-key IAM role or artifact-specific owner approval exists; no TOTP or AWS call was made" 77
exit 0
