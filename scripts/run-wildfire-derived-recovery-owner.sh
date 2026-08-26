#!/bin/zsh
# Single owner-local entry point for the bounded BC/Ontario recovery.
# It captures a fresh root/default read-only state, performs every local
# approval/IAM/artifact preflight, and only then delegates to the existing
# MFA-gated runner. It never changes IAM or S3 itself.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKER="$SCRIPT_DIR/check-wildfire-derived-recovery.mjs"
CAPTURE="$SCRIPT_DIR/capture-wildfire-derived-recovery-state.mjs"
RUNNER="$SCRIPT_DIR/run-wildfire-derived-recovery.sh"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data}"

fail() {
  local message="$1" exit_status=1
  [[ $# -ge 2 ]] && exit_status="$2"
  print -u2 -- "Stopped: $message"
  exit "$exit_status"
}

if [[ $# -eq 5 && ( "$1" == "--preflight" || "$1" == "--dry-run" || "$1" == "--recover" ) ]]; then
  MODE="$1"
else
  fail "Usage: $0 --preflight|--dry-run|--recover /absolute/approval.json /absolute/private-state.json /absolute/applied-iam-attestation.json /absolute/evidence.json" 64
fi
APPROVAL="$2"
STATE="$3"
ATTESTATION="$4"
EVIDENCE="$5"

for input_path in "$APPROVAL" "$STATE" "$ATTESTATION" "$EVIDENCE"; do
  [[ "$input_path" == /* ]] || fail "Approval, state, attestation, and evidence paths must be absolute; no root or AWS call was made" 65
done
[[ -d "$DATA_ROOT" && "$DATA_ROOT" == /* ]] || fail "Derived data root is absent or not absolute; no root or AWS call was made" 65
command -v node >/dev/null || fail "node is required; no root or AWS call was made" 69
command -v jq >/dev/null || fail "jq is required; no root or AWS call was made" 69
command -v aws >/dev/null || fail "aws CLI is required; no root or AWS call was made" 69

for input_path in "$APPROVAL" "$ATTESTATION"; do
  [[ -f "$input_path" && -O "$input_path" && "$(stat -f %Lp "$input_path" 2>/dev/null)" == 600 ]] || fail "Approval and IAM attestation must be owner-owned mode-600 files; no root or AWS call was made" 65
done
[[ ! -e "$STATE" ]] || fail "Private state path already exists; refusing stale state and no root or AWS call was made" 65
[[ ! -e "$EVIDENCE" ]] || fail "Evidence path already exists, including partial evidence; refusing reuse and no root or AWS call was made" 65

# The only AWS-facing step before the MFA runner is the bounded root/default
# read-only state capture. Its own checker requires the exact account root,
# concrete BC version/checksum, and three 404 absence proofs.
if ! node "$CAPTURE" --state "$STATE" > /dev/null 2> /dev/null; then
  fail "Fresh root/default state capture failed closed; no MFA or recovery mutation was attempted" 65
fi
[[ -f "$STATE" && -O "$STATE" && "$(stat -f %Lp "$STATE" 2>/dev/null)" == 600 ]] || fail "Fresh private state was not written owner-only mode 600; no MFA or recovery mutation was attempted" 65

# This checker is local-only. It validates owner approval, applied IAM
# attestation, fresh state, and every controlled BC/Ontario local artifact.
if ! node "$CHECKER" --preflight "$APPROVAL" "$STATE" "$ATTESTATION" "$DATA_ROOT" "$EVIDENCE" > /dev/null 2> /dev/null; then
  fail "Approval, fresh root state, IAM attestation, or local artifact preflight failed closed; no MFA or recovery mutation was attempted" 65
fi

if [[ "$MODE" == "--preflight" || "$MODE" == "--dry-run" ]]; then
  print -- "PRECHECK passed: fresh root/default state, exact owner approval, applied IAM attestation, and local derived artifacts verified; no TOTP or recovery mutation was attempted."
  print -- "DRY-RUN: existing BC payload version only; three conditional target writes; payload-and-manifest COMPLIANCE retention/readbacks through 2033-08-12T00:00:00Z."
  exit 0
fi

# The existing runner performs the interactive MFA prompt and all exact
# conditional writes/readbacks. No prompt is reached before both preflights
# above pass, and this wrapper never handles or stores the TOTP.
exec zsh "$RUNNER" --recover "$APPROVAL" "$STATE" "$ATTESTATION" "$EVIDENCE"
