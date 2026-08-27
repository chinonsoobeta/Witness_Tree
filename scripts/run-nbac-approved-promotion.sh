#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"
source "${0:A:h}/archive-existing-key-recovery.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ROOT="/Volumes/Extended_SSD/Witness_Tree-data"
RAW="$DATA_ROOT/raw/nrcan-nbac-1972-2025/2026-08-27/NBAC_1972to2025_20260513_shp.zip"
PAYLOAD_KEY="raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip"
MANIFEST_KEY="raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/manifest.json"
TMP=""

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  if [[ -n "$TMP" && "$TMP" == "$DATA_ROOT/.tmp/nbac-promotion."* && -d "$TMP" ]]; then rm -rf "$TMP"; fi
}
trap cleanup EXIT

[[ $# -eq 1 && ( "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 --preflight|--run" 64
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
command -v shasum >/dev/null || fail "shasum is required" 69
node "$ROOT/scripts/prepare-nbac-immutable-promotion.mjs" >/dev/null
node "$ROOT/scripts/check-nbac-archive-iam-applied.mjs" --verify-live >/dev/null
[[ -f "$RAW" ]] || fail "Exact NBAC payload is absent from the external data root; no TOTP or AWS call was made" 65
[[ "$(stat -f %z "$RAW")" == 1257052370 ]] || fail "Exact NBAC payload byte length differs; no TOTP or AWS call was made" 65
[[ "$(shasum -a 256 "$RAW" | awk '{print $1}')" == c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165 ]] || fail "Exact NBAC payload SHA-256 differs; no TOTP or AWS call was made" 65
print -- "PRECHECK passed: the exact NBAC payload and exact-key IAM readback are verified; no TOTP or storage call was made."
[[ "$1" == "--preflight" ]] && exit 0

creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-nbac-approved-promotion)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")"
export AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")"
export AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"
unset creds
mkdir -p "$DATA_ROOT/.tmp"
TMP="$(mktemp -d "$DATA_ROOT/.tmp/nbac-promotion.XXXXXX")"
chmod 700 "$TMP"
STAGED="$TMP/nbac_1972to2025_20260513_shp.zip"
cp "$RAW" "$STAGED"
chmod 400 "$STAGED"
[[ "$(stat -f %z "$STAGED")" == 1257052370 ]] || fail "Staged NBAC payload byte length differs; no storage write was made" 65
[[ "$(shasum -a 256 "$STAGED" | awk '{print $1}')" == c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165 ]] || fail "Staged NBAC payload SHA-256 differs; no storage write was made" 65
node "$ROOT/scripts/prepare-nbac-immutable-promotion.mjs" --write-manifest "$TMP" >/dev/null
MANIFEST="$TMP/nbac.manifest.json"

PAYLOAD_PUT_ERROR="$TMP/nbac-payload.put.stderr"
if put="$(aws s3api put-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --body "$STAGED" --if-none-match '*' --checksum-algorithm CRC64NVME --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$RETAIN_UNTIL" --region "$REGION" --cli-read-timeout 0 --output json 2>"$PAYLOAD_PUT_ERROR")"; then
  payload_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "NBAC payload acknowledgement has no concrete version" 70
else
  # An exact-key conditional write is the only reliable absence test available
  # to this least-privilege role. If it lost the race to an existing object,
  # that current version must be readable and byte-identical. Any other failure
  # remains fail-closed and the private AWS diagnostic stays in TMP until exit.
  wt_archive_head_current_or_absent "$PAYLOAD_KEY" nbac-payload || fail "Conditional NBAC payload write failed and no exact existing object is readable" 70
  payload_version="$WT_ARCHIVE_VERSION"
fi
wt_archive_verify_existing_payload "$PAYLOAD_KEY" "$payload_version" 1257052370 c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165 nbac-payload

MANIFEST_PUT_ERROR="$TMP/nbac-manifest.put.stderr"
if put="$(aws s3api put-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --body "$MANIFEST" --if-none-match '*' --checksum-algorithm CRC64NVME --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$RETAIN_UNTIL" --region "$REGION" --output json 2>"$MANIFEST_PUT_ERROR")"; then
  manifest_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "NBAC manifest acknowledgement has no concrete version" 70
else
  wt_archive_head_current_or_absent "$MANIFEST_KEY" nbac-manifest || fail "Conditional NBAC manifest write failed and no exact existing object is readable" 70
  manifest_version="$WT_ARCHIVE_VERSION"
fi
wt_archive_verify_existing_manifest "$MANIFEST_KEY" "$manifest_version" "$MANIFEST" nbac-manifest

wt_archive_ensure_compliance_retention "$PAYLOAD_KEY" "$payload_version" nbac-payload
wt_archive_ensure_compliance_retention "$MANIFEST_KEY" "$manifest_version" nbac-manifest
print -- "NBAC promotion completed with exact-version payload and manifest readback plus COMPLIANCE retention. Capture redacted evidence before ledger promotion."
