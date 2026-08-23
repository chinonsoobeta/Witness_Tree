#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
fail() { print -u2 -- "$1"; exit "${2:-65}"; }
LOCK_PATH="/private/tmp/witness-tree-current-wildfire-promotion-lock/run.lock"
LOCK_JSON=""

cleanup() {
  local exit_status=$?
  if [[ -n "$LOCK_JSON" ]]; then
    node "$ROOT/scripts/current-wildfire-run-lock.mjs" release "$LOCK_PATH" "$LOCK_JSON" >/dev/null 2>&1 || { print -u2 -- "Current-wildfire lock release was not proved; explicit owner cleanup is required."; exit_status=70; }
  fi
  exit "$exit_status"
}
trap cleanup EXIT

[[ $# -eq 0 || "$1" == "--preflight" ]] || {
  [[ "$1" == "--run" && $# -eq 4 ]] || fail "Usage: $0 [--preflight | --run CHECKPOINT PRIVATE_OUTPUT PUBLIC_OUTPUT]"
}

LOCK_JSON="$(node "$ROOT/scripts/current-wildfire-run-lock.mjs" acquire "$LOCK_PATH")" || fail "Current-wildfire preflight lock is unavailable; inspect the owner-cleanup marker." 73

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
