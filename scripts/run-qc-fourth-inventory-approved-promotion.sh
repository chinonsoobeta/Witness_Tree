#!/bin/zsh
set -euo pipefail
umask 077

# This is the only owner-local execution wrapper for the QC fourth-inventory
# runner.  It deliberately obtains a fresh MFA session and proves the exact
# operator, account, role, and session name before the first S3 mutation.
PROFILE="WitnessTreeArchiveOperator"
ACCOUNT="286853118812"
OPERATOR_ARN="arn:aws:iam::${ACCOUNT}:user/${PROFILE}"
ROLE="WitnessTreeQcFourthArchivePromotionUploader"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
SESSION_NAME="witness-tree-qc-fourth-approved-promotion"
REGION="ca-central-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ROOT=""
STATE_DIR=""
SIDECAR_DIR=""
STATE=""
PRIVATE_OUTPUT=""
REDACTED_OUTPUT=""

cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
  unset WITNESS_TREE_SESSION_VERIFIED WITNESS_TREE_ACCOUNT WITNESS_TREE_OPERATOR_ARN WITNESS_TREE_ROLE_ARN WITNESS_TREE_ROLE_SESSION_NAME WITNESS_TREE_SESSION_EXPIRES_AT WITNESS_TREE_MFA_PRESENT WITNESS_TREE_ASSUMED_ROLE_ARN WITNESS_TREE_ROLE_USER_ID WITNESS_TREE_MFA_SERIAL_ARN
}
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required" 69; }
absolute() { [[ "$1" == /* ]] || fail "$2 must be an absolute path" 64; }

[[ $# -ge 1 ]] || { node "$ROOT/scripts/check-qc-fourth-inventory-immutable-promotion.mjs"; exit 0; }
MODE="$1"; shift
case "$MODE" in
  --preflight)
    [[ $# -eq 2 && "$1" == "--data-root" ]] || fail "Usage: $0 --preflight --data-root <absolute-Witness_Tree-data>" 64
    DATA_ROOT="$2"; absolute "$DATA_ROOT" "--data-root"
    exec node "$ROOT/scripts/qc-fourth-inventory-immutable-promotion.mjs" --preflight --data-root "$DATA_ROOT"
    ;;
  --run)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --data-root) [[ $# -ge 2 ]] || fail "--data-root requires a value" 64; DATA_ROOT="$2"; shift 2 ;;
        --state-dir) [[ $# -ge 2 ]] || fail "--state-dir requires a value" 64; STATE_DIR="$2"; shift 2 ;;
        --sidecar-dir) [[ $# -ge 2 ]] || fail "--sidecar-dir requires a value" 64; SIDECAR_DIR="$2"; shift 2 ;;
        *) fail "only --data-root, --state-dir, and --sidecar-dir may be supplied to this wrapper" 64 ;;
      esac
    done
    [[ -n "$DATA_ROOT" && -n "$STATE_DIR" && -n "$SIDECAR_DIR" ]] || fail "--data-root, --state-dir, and --sidecar-dir are all required" 64
    absolute "$DATA_ROOT" "--data-root"; absolute "$STATE_DIR" "--state-dir"; absolute "$SIDECAR_DIR" "--sidecar-dir"
    ;;
  --capture)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --state) [[ $# -ge 2 ]] || fail "--state requires a value" 64; STATE="$2"; shift 2 ;;
        --data-root) [[ $# -ge 2 ]] || fail "--data-root requires a value" 64; DATA_ROOT="$2"; shift 2 ;;
        --sidecar-dir) [[ $# -ge 2 ]] || fail "--sidecar-dir requires a value" 64; SIDECAR_DIR="$2"; shift 2 ;;
        --private-output) [[ $# -ge 2 ]] || fail "--private-output requires a value" 64; PRIVATE_OUTPUT="$2"; shift 2 ;;
        --redacted-output) [[ $# -ge 2 ]] || fail "--redacted-output requires a value" 64; REDACTED_OUTPUT="$2"; shift 2 ;;
        *) fail "only --state, --data-root, --sidecar-dir, --private-output, and --redacted-output may be supplied to capture" 64 ;;
      esac
    done
    [[ -n "$STATE" && -n "$DATA_ROOT" && -n "$SIDECAR_DIR" && -n "$PRIVATE_OUTPUT" && -n "$REDACTED_OUTPUT" ]] || fail "capture requires --state, --data-root, --sidecar-dir, --private-output, and --redacted-output" 64
    absolute "$STATE" "--state"; absolute "$DATA_ROOT" "--data-root"; absolute "$SIDECAR_DIR" "--sidecar-dir"; absolute "$PRIVATE_OUTPUT" "--private-output"; absolute "$REDACTED_OUTPUT" "--redacted-output"
    ;;
  *) fail "Usage: $0 [--preflight ...|--run ...|--capture ...]" 64 ;;
esac

need node
need aws
need jq
node "$ROOT/scripts/qc-fourth-inventory-immutable-promotion.mjs" --preflight --data-root "$DATA_ROOT"
[[ -t 0 && -t 1 ]] || fail "fresh MFA TOTP requires an interactive terminal; no AWS call was made" 64

# Do not allow inherited long-lived credentials to influence the bootstrap.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "configured MFA serial is absent or outside the approved account" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --region "$REGION" --output json 2>/dev/null)" || fail "MFA session failed" 77
export WITNESS_TREE_MFA_SERIAL_ARN="$mfa_serial"
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")"
export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")"
export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"
unset bootstrap

operator_identity="$(aws sts get-caller-identity --region "$REGION" --output json 2>/dev/null)" || fail "cannot identify the MFA session" 77
jq -e --arg account "$ACCOUNT" --arg arn "$OPERATOR_ARN" '.Account==$account and .Arn==$arn' <<<"$operator_identity" >/dev/null || fail "MFA session is not the exact approved operator identity" 77
unset operator_identity

role_session="$(aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name "$SESSION_NAME" --duration-seconds 3600 --region "$REGION" --output json 2>/dev/null)" || fail "promotion role assumption failed" 77
export WITNESS_TREE_SESSION_EXPIRES_AT="$(jq -er '.Credentials.Expiration' <<<"$role_session")"
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$role_session")"
export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$role_session")"
export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$role_session")"
unset role_session
role_identity="$(aws sts get-caller-identity --region "$REGION" --output json 2>/dev/null)" || fail "cannot identify the assumed promotion role" 77
jq -e --arg account "$ACCOUNT" --arg role "$ROLE" --arg session "$SESSION_NAME" '.Account==$account and .Arn==("arn:aws:sts::"+$account+":assumed-role/"+$role+"/"+$session)' <<<"$role_identity" >/dev/null || fail "assumed identity is not the exact approved promotion role/session" 77
export WITNESS_TREE_ASSUMED_ROLE_ARN="$(jq -er '.Arn' <<<"$role_identity")" WITNESS_TREE_ROLE_USER_ID="$(jq -er '.UserId' <<<"$role_identity")"
unset role_identity
export WITNESS_TREE_SESSION_VERIFIED=1 WITNESS_TREE_ACCOUNT="$ACCOUNT" WITNESS_TREE_OPERATOR_ARN="$OPERATOR_ARN" WITNESS_TREE_ROLE_ARN="$ROLE_ARN" WITNESS_TREE_ROLE_SESSION_NAME="$SESSION_NAME" WITNESS_TREE_MFA_PRESENT=true

if [[ "$MODE" == "--capture" ]]; then
  exec node "$ROOT/scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs" \
    --capture --session-ready --state "$STATE" --data-root "$DATA_ROOT" --sidecar-dir "$SIDECAR_DIR" \
    --private-output "$PRIVATE_OUTPUT" --redacted-output "$REDACTED_OUTPUT"
fi

exec node "$ROOT/scripts/qc-fourth-inventory-immutable-promotion.mjs" --execute \
  --approve-exact-artifact-set --approve-iam-policy --approve-compliance-retention \
  --approve-mfa-session --retention-until 2033-08-12T00:00:00Z --session-ready \
  --data-root "$DATA_ROOT" --state-dir "$STATE_DIR" --sidecar-dir "$SIDECAR_DIR"
