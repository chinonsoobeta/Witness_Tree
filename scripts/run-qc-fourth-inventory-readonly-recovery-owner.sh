#!/bin/zsh
set -euo pipefail
umask 077

# Separate owner-local read-only recovery wrapper. It never invokes a storage
# mutation; the JavaScript tool has a second explicit read-only gate.
PROFILE="WitnessTreeArchiveOperator"
ACCOUNT="286853118812"
OPERATOR_ARN="arn:aws:iam::${ACCOUNT}:user/${PROFILE}"
ROLE="WitnessTreeQcFourthArchivePromotionUploader"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
SESSION_NAME="witness-tree-qc-fourth-readonly-recovery"
REGION="ca-central-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE=""
DATA_ROOT=""
OUTPUT=""
cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN WITNESS_TREE_SESSION_VERIFIED WITNESS_TREE_ACCOUNT WITNESS_TREE_OPERATOR_ARN WITNESS_TREE_ROLE_ARN WITNESS_TREE_ROLE_SESSION_NAME WITNESS_TREE_SESSION_EXPIRES_AT WITNESS_TREE_MFA_PRESENT WITNESS_TREE_ASSUMED_ROLE_ARN WITNESS_TREE_ROLE_USER_ID WITNESS_TREE_MFA_SERIAL_ARN; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
absolute() { [[ "$1" == /* ]] || fail "$2 must be an absolute path" 64; }

[[ "${1:-}" == "--recover" ]] || fail "Usage: $0 --recover --state <mode-600-state> --data-root <Witness_Tree-data> --output <new-mode-600-output>" 64
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state) [[ $# -ge 2 ]] || fail "--state requires a value" 64; STATE="$2"; shift 2 ;;
    --data-root) [[ $# -ge 2 ]] || fail "--data-root requires a value" 64; DATA_ROOT="$2"; shift 2 ;;
    --output) [[ $# -ge 2 ]] || fail "--output requires a value" 64; OUTPUT="$2"; shift 2 ;;
    *) fail "unknown option" 64 ;;
  esac
done
[[ -n "$STATE" && -n "$DATA_ROOT" && -n "$OUTPUT" ]] || fail "--state, --data-root, and --output are required" 64
absolute "$STATE" "--state"; absolute "$DATA_ROOT" "--data-root"; absolute "$OUTPUT" "--output"
command -v aws >/dev/null 2>&1 || fail "aws CLI is required" 69
command -v jq >/dev/null 2>&1 || fail "jq is required" 69
[[ -t 0 && -t 1 ]] || fail "fresh MFA TOTP requires an interactive terminal" 64
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "configured MFA serial is outside the approved account" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --region "$REGION" --output json 2>/dev/null)" || fail "MFA session failed" 77
export WITNESS_TREE_MFA_SERIAL_ARN="$mfa_serial"
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"
unset bootstrap
identity="$(aws sts get-caller-identity --region "$REGION" --output json 2>/dev/null)" || fail "cannot identify MFA session" 77
jq -e --arg account "$ACCOUNT" --arg arn "$OPERATOR_ARN" '.Account==$account and .Arn==$arn' <<<"$identity" >/dev/null || fail "MFA session is not the exact approved operator" 77
unset identity
role_session="$(aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name "$SESSION_NAME" --duration-seconds 3600 --region "$REGION" --output json 2>/dev/null)" || fail "read-only role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$role_session")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$role_session")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$role_session")"
export WITNESS_TREE_SESSION_EXPIRES_AT="$(jq -er '.Credentials.Expiration' <<<"$role_session")"
unset role_session
role_identity="$(aws sts get-caller-identity --region "$REGION" --output json 2>/dev/null)" || fail "cannot identify the assumed read-only role" 77
jq -e --arg account "$ACCOUNT" --arg role "$ROLE" --arg session "$SESSION_NAME" '.Account==$account and .Arn==("arn:aws:sts::"+$account+":assumed-role/"+$role+"/"+$session)' <<<"$role_identity" >/dev/null || fail "assumed identity is not the exact approved read-only role/session" 77
export WITNESS_TREE_ASSUMED_ROLE_ARN="$(jq -er '.Arn' <<<"$role_identity")" WITNESS_TREE_ROLE_USER_ID="$(jq -er '.UserId' <<<"$role_identity")"
unset role_identity
export WITNESS_TREE_SESSION_VERIFIED=1 WITNESS_TREE_ACCOUNT="$ACCOUNT" WITNESS_TREE_OPERATOR_ARN="$OPERATOR_ARN" WITNESS_TREE_ROLE_ARN="$ROLE_ARN" WITNESS_TREE_ROLE_SESSION_NAME="$SESSION_NAME" WITNESS_TREE_MFA_PRESENT=true
exec node "$ROOT/scripts/recover-qc-fourth-inventory-immutable-promotion-readonly.mjs" --recover --approve-read-only-recovery --session-ready --state "$STATE" --data-root "$DATA_ROOT" --output "$OUTPUT"
