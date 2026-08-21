#!/bin/zsh
# Owner-local exact readback only. This path never lists a bucket, uploads,
# completes an MPU, writes retention, rewrites a sidecar, deletes an object,
# changes IAM, or uses a governance bypass or legal hold.
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeWildfireDerivedPromotionUploader"
ACCOUNT="286853118812"
REGION="ca-central-1"
BUCKET="witness-tree-raw-archive-ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKER="$SCRIPT_DIR/check-wildfire-derived-readback.mjs"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data}"
MODE=""
APPROVAL=""
TMP=""

BC_PAYLOAD="derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/payload/bc-wildfire-216-feature-release.gpkg"
BC_MANIFEST="derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/manifest.json"
ON_PAYLOAD="derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/payload/ontario-in-year-fire-perimeters-188-feature-derived.gpkg"
ON_MANIFEST="derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/manifest.json"

fail() {
  local message="$1" exit_status=1
  [[ $# -ge 2 ]] && exit_status="$2"
  print -u2 -- "Stopped: $message"
  exit "$exit_status"
}

cleanup() {
  local exit_status=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN totp mfa_serial
  if [[ -n "$TMP" && -d "$TMP" ]]; then rm -rf "$TMP"; fi
  exit "$exit_status"
}
trap cleanup EXIT

if [[ $# -eq 2 && "$1" == "--preflight" ]]; then
  MODE="preflight"
elif [[ $# -eq 2 && "$1" == "--readback" ]]; then
  MODE="readback"
else
  fail "Usage: $0 --preflight|--readback /absolute/approval.json" 64
fi
APPROVAL="$2"
[[ "$APPROVAL" == /* ]] || fail "Approval path must be absolute; no TOTP or AWS call was made" 65
[[ -d "$DATA_ROOT" && "$DATA_ROOT" == /* ]] || fail "Derived data root is absent or not absolute; no TOTP or AWS call was made" 65
command -v node >/dev/null || fail "node is required; no TOTP or AWS call was made" 69
command -v jq >/dev/null || fail "jq is required; no TOTP or AWS call was made" 69
command -v aws >/dev/null || fail "aws CLI is required; no TOTP or AWS call was made" 69
[[ -f "$APPROVAL" && -O "$APPROVAL" && "$(stat -f %Lp "$APPROVAL" 2>/dev/null)" == 600 ]] || fail "Approval file must be owner-owned mode-600; no TOTP or AWS call was made" 65

TMP="$(mktemp -d /private/tmp/witness-tree-derived-readback.XXXXXX)" || fail "Could not create a private readback directory" 69
chmod 700 "$TMP"
if ! node "$CHECKER" --approval "$APPROVAL" "$DATA_ROOT" >"$TMP/local-check.stdout" 2>"$TMP/local-check.stderr"; then
  fail "Approval or local derived artifacts failed closed; no TOTP or AWS call was made" 65
fi
if [[ "$MODE" == "preflight" ]]; then
  print -- "PRECHECK passed: exact BC 216-feature and Ontario 188-feature local artifacts and readback approval verified; no TOTP or AWS call was made."
  exit 0
fi

[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS readback was authorized" 64
read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "$totp" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>"$TMP/mfa-serial.stderr")" || fail "Configured MFA serial could not be read; no AWS readback was authorized" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent or outside the approved account; no STS or S3 readback was authorized" 69
if ! aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json >"$TMP/bootstrap.json" 2>"$TMP/sts-session.stderr"; then
  fail "MFA session failed; no S3 readback was authorized" 77
fi
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$TMP/bootstrap.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$TMP/bootstrap.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$TMP/bootstrap.json")"
account="$(aws sts get-caller-identity --query Account --output text 2>"$TMP/caller.stderr")" || fail "MFA session identity could not be verified; no S3 readback was authorized" 77
[[ "$account" == "$ACCOUNT" ]] || fail "MFA session is outside the approved account; no S3 readback was authorized" 77
if ! aws sts assume-role --role-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --role-session-name witness-tree-derived-readback --duration-seconds 3600 --output json >"$TMP/role-session.json" 2>"$TMP/sts-role.stderr"; then
  fail "Approved derived readback role assumption failed; no S3 readback was authorized" 77
fi
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$TMP/role-session.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$TMP/role-session.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$TMP/role-session.json")"

head_exact() {
  local label="$1" key="$2" version=""
  if ! aws s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/$label-latest.json" 2>"$TMP/$label-latest.stderr"; then
    fail "Exact derived object head failed; no upload, retention write, or other mutation was attempted" 70
  fi
  version="$(jq -er '.VersionId | select(type == "string" and length > 0)' "$TMP/$label-latest.json" 2>/dev/null)" || fail "Exact derived object has no concrete version; no retention read or mutation was attempted" 70
  if ! aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/$label.json" 2>"$TMP/$label.stderr"; then
    fail "Exact versioned derived object head failed; no retention read or mutation was attempted" 70
  fi
}

read_payload_retention() {
  local label="$1" key="$2" version
  version="$(jq -er '.VersionId' "$TMP/$label.json")" || fail "Exact payload version was absent; no retention read or mutation was attempted" 70
  if ! aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json >"$TMP/$label-retention.json" 2>"$TMP/$label-retention.stderr"; then
    fail "Exact payload retention read failed; no retention write or other mutation was attempted" 70
  fi
}

head_exact bc-payload "$BC_PAYLOAD"
head_exact bc-manifest "$BC_MANIFEST"
read_payload_retention bc-payload "$BC_PAYLOAD"
head_exact on-payload "$ON_PAYLOAD"
head_exact on-manifest "$ON_MANIFEST"
read_payload_retention on-payload "$ON_PAYLOAD"

jq -n \
  --slurpfile bcp "$TMP/bc-payload.json" --slurpfile bcm "$TMP/bc-manifest.json" --slurpfile bcr "$TMP/bc-payload-retention.json" \
  --slurpfile onp "$TMP/on-payload.json" --slurpfile onm "$TMP/on-manifest.json" --slurpfile onr "$TMP/on-payload-retention.json" \
  '{"bc-wildfire-216-feature-derived-2026-08-14":{payload:$bcp[0],manifest:$bcm[0],retention:$bcr[0]},"ontario-in-year-fire-188-feature-derived-2026-08-14":{payload:$onp[0],manifest:$onm[0],retention:$onr[0]}}' \
  >"$TMP/readback.json"
if ! node "$CHECKER" --readback "$APPROVAL" "$TMP/readback.json" >"$TMP/readback-check.stdout" 2>"$TMP/readback-check.stderr"; then
  fail "Exact derived payload, manifest, checksum, version, or retention readback failed closed; no mutation was attempted" 70
fi
print -- "Derived wildfire exact BC/Ontario payload, manifest, FULL_OBJECT checksum, concrete-version, and COMPLIANCE retention readbacks passed; no upload or other mutation was attempted."
