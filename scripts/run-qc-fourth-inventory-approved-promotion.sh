#!/bin/zsh
# Owner-local Québec fourth-inventory promotion.  It deliberately has no
# arguments for arbitrary paths, credentials, roles, keys, or MFA values.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$ROOT/scripts/qc-fourth-inventory-immutable-promotion.mjs"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
STATE_DIR="$DATA_ROOT/work/qc-fourth-inventory/immutable-promotion-state"
SIDECAR_DIR="$DATA_ROOT/work/qc-fourth-inventory/immutable-promotion-sidecars"

cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN creds
}
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }

if [[ $# -eq 0 ]]; then
  node "$ROOT/scripts/check-qc-fourth-inventory-immutable-promotion.mjs"
  exit 0
fi
[[ ( "${1:-}" == "--preflight" || "${1:-}" == "--run" || "${1:-}" == "--resume-batch-two" ) && $# -eq 1 ]] || fail "Usage: $0 [--preflight|--run|--resume-batch-two]" 64
MODE="$1"

# The same no-cloud preflight is performed before a run so a bad local source
# set cannot consume an MFA session or reach STS/S3.  The execution program
# repeats it after credentials exist, closing the time-of-check/time-of-use gap.
node "$RUNNER" --preflight --data-root "$DATA_ROOT"
[[ "$MODE" == "--preflight" ]] && exit 0

command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
mkdir -p "$STATE_DIR" "$SIDECAR_DIR"
chmod 700 "$STATE_DIR" "$SIDECAR_DIR"
[[ -d "$STATE_DIR" && ! -L "$STATE_DIR" && -d "$SIDECAR_DIR" && ! -L "$SIDECAR_DIR" ]] || fail "Controlled state and sidecar paths must be real directories" 73

if [[ "$MODE" == "--resume-batch-two" ]]; then
  batches=("WitnessTreeQcFourthArchivePromotionUploaderBatchTwo:batch-two")
else
  batches=("WitnessTreeQcFourthArchivePromotionUploader:batch-one" "WitnessTreeQcFourthArchivePromotionUploaderBatchTwo:batch-two")
fi
for batch_role_batch in "${batches[@]}"; do
  ROLE="${batch_role_batch%%:*}"
  BATCH="${batch_role_batch##*:}"
  creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" "witness-tree-qc-fourth-inventory-$BATCH")"
  export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$creds")"
  export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$creds")"
  export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$creds")"
  unset creds
  node "$RUNNER" --execute \
    --approve-exact-artifact-set \
    --approve-iam-policy \
    --approve-compliance-retention \
    --approve-mfa-session \
    --retention-until 2033-08-12T00:00:00Z \
    --session-ready \
    --batch "$BATCH" \
    --data-root "$DATA_ROOT" \
    --state-dir "$STATE_DIR" \
    --sidecar-dir "$SIDECAR_DIR"
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
done
