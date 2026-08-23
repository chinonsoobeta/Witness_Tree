#!/bin/zsh
set -euo pipefail
umask 077

ROOT="${0:A:h:h}"
PLAN="$ROOT/data/elections-canada-fed-2025-promotion-preparation.json"
APPROVAL="$ROOT/data/phase1-phase3-owner-approvals-2026-08-21.json"
IAM_DESIRED="$ROOT/data/federal-electoral-promotion-iam-desired-state.json"
OWNER_PACKET="$ROOT/data/phase1-owner-approval-packet.json"
ARCHIVE_READINESS="$ROOT/data/archive-operations-readiness.json"
READINESS_PACKAGE="$ROOT/data/federal-electoral-archive-readiness-owner-evidence.json"
LOCK_DIR="/private/tmp/witness-tree-federal-electoral-promotion.run-lock"
LOCK_TOMBSTONE="/private/tmp/witness-tree-federal-electoral-promotion.run-lock.release.$$"
LOCK_JSON=""

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

cleanup() {
  local exit_status=$? lock_dev lock_ino
  if [[ -n "$LOCK_JSON" ]]; then
    lock_dev="$(jq -er '.dev' <<<"$LOCK_JSON" 2>/dev/null || true)"
    lock_ino="$(jq -er '.ino' <<<"$LOCK_JSON" 2>/dev/null || true)"
    node "$ROOT/scripts/federal-electoral-run-lock.mjs" release "$LOCK_DIR" "$lock_dev" "$lock_ino" "$LOCK_TOMBSTONE" >/dev/null 2>&1 || { print -u2 -- "Stopped: owner-only run lock release was not proved; inspect lock state."; exit_status=70; }
  fi
  exit "$exit_status"
}
trap cleanup EXIT

[[ $# -eq 1 && ( "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 --preflight|--run" 64
for tool in node jq shasum stat basename awk; do need "$tool"; done
LOCK_JSON="$(node "$ROOT/scripts/federal-electoral-run-lock.mjs" acquire "$LOCK_DIR")" || fail "Another federal promotion preflight holds the owner-only lock" 73

node "$ROOT/scripts/check-federal-electoral-promotion-gates.mjs" \
  --plan "$PLAN" --approval "$APPROVAL" --iam "$IAM_DESIRED" \
  --owner-packet "$OWNER_PACKET" --readiness "$ARCHIVE_READINESS" \
  --readiness-package "$READINESS_PACKAGE" >/dev/null \
  || fail "Federal canonical plan, approval, IAM, owner packet, or readiness evidence gate failed" 75

SOURCE_LOCAL_PATH="$(jq -er '.snapshot.localPath' "$PLAN")" || fail "Federal plan local descriptor path is unavailable" 65
BYTES="$(jq -er '.snapshot.byteLength' "$PLAN")" || fail "Federal plan byte length is unavailable" 65
SHA256="$(jq -er '.snapshot.sha256' "$PLAN")" || fail "Federal plan SHA-256 is unavailable" 65
[[ "$BYTES" == "10301648" && "$SHA256" == "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93" ]] || fail "Federal plan identity is not the exact approved artifact" 65
[[ "$SOURCE_LOCAL_PATH" == ../Witness_Tree-data/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip ]] || fail "Federal plan local path is outside the exact approved artifact" 65
DATA_ROOT="${FEDERAL_DATA_ROOT:-$ROOT/../Witness_Tree-data}"
[[ "$DATA_ROOT" == /* && "$(basename "$DATA_ROOT")" == "Witness_Tree-data" && -d "$DATA_ROOT" && ! -L "$DATA_ROOT" ]] || fail "Federal data root is not the controlled Witness_Tree-data directory" 65
PAYLOAD="$DATA_ROOT/${SOURCE_LOCAL_PATH#../Witness_Tree-data/}"
[[ -f "$PAYLOAD" && ! -L "$PAYLOAD" ]] || fail "Approved federal payload is missing or aliased" 65
[[ "$(stat -f %z "$PAYLOAD")" == "$BYTES" ]] || fail "Approved federal byte length drifted" 65
[[ "$(shasum -a 256 "$PAYLOAD" | awk '{print $1}')" == "$SHA256" ]] || fail "Approved federal source SHA-256 drifted" 65
print -- "Federal PRECHECK passed: exact canonical plan-bound source and owner-only lock; no MFA, network, or external command was used."

[[ "$1" == "--preflight" ]] && exit 0
node "$ROOT/scripts/check-federal-electoral-promotion-gates.mjs" \
  --plan "$PLAN" --approval "$APPROVAL" --iam "$IAM_DESIRED" \
  --owner-packet "$OWNER_PACKET" --readiness "$ARCHIVE_READINESS" \
  --readiness-package "$READINESS_PACKAGE" --require-ready >/dev/null \
  || fail "Canonical owner readiness evidence is not approved; execution remains disabled" 75
fail "External federal promotion execution is intentionally not implemented in this offline correction" 75
