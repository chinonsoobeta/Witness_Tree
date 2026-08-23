#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
fail() { print -u2 -- "$1"; exit "${2:-65}"; }

[[ $# -eq 0 || "$1" == "--preflight" ]] || {
  [[ "$1" == "--run" && $# -eq 4 ]] || fail "Usage: $0 [--preflight | --run CHECKPOINT PRIVATE_OUTPUT PUBLIC_OUTPUT]"
}

node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs" >/dev/null
node "$ROOT/scripts/check-current-wildfire-owner-admission.mjs" >/dev/null

if [[ $# -eq 0 ]]; then
  node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs"
  exit 0
fi

if [[ "$1" == "--preflight" ]]; then
  print -- "Current-wildfire local preflight passed. External execution remains disabled."
  exit 0
fi

for output in "$2" "$3" "$4"; do
  [[ "$output" == /* ]] || fail "Every execution output path must be absolute."
done
[[ "$2" != "$3" && "$2" != "$4" && "$3" != "$4" ]] || fail "Execution output paths must be distinct."

fail "External execution is fail-closed: no descriptor-consuming upload adapter is checked in, so verified bytes cannot safely cross the upload boundary." 75
