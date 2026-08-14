#!/bin/zsh
set -euo pipefail
umask 077

# Owner-local only. Default is a pure dry run; --run requires the separate exact approval.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreePlviArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/alberta-plvi-immutable-promotion-preparation.json"
# The approved owner-local workspace data root is deliberately absolute. The
# promotion worktree lives under /private/tmp and is not a sibling of this data.
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
if [[ "${1:-}" == "--preflight" && -n "${WITNESS_TREE_PLVI_PREFLIGHT_DATA_ROOT:-}" ]]; then DATA_ROOT="$WITNESS_TREE_PLVI_PREFLIGHT_DATA_ROOT"; fi
RAW="$DATA_ROOT/raw/alberta-primary-land-vegetation/2026-08-14/PrimaryLandAndVegetationInventoryPLVI.zip"
DERIVED="$DATA_ROOT/derived/alberta-plvi-full-repair-v1/2026-08-14/alberta-plvi-full-repaired-closed-join.gpkg"
TMP=""
cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN; [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }

if [[ $# -eq 0 ]]; then node "$ROOT/scripts/prepare-alberta-plvi-immutable-promotion.mjs"; exit 0; fi
[[ ( "${1:-}" == "--preflight" || "${1:-}" == "--run" ) && $# -eq 1 ]] || fail "Usage: $0 [--preflight|--run]" 64
command -v shasum >/dev/null || fail "shasum is required" 69
node "$ROOT/scripts/prepare-alberta-plvi-immutable-promotion.mjs" >/dev/null
[[ -f "$RAW" ]] || fail "Approved raw ZIP is missing at the controlled workspace-data path; no TOTP or AWS call was made" 65
[[ -f "$DERIVED" ]] || fail "Approved derived GeoPackage is missing at the controlled workspace-data path; no TOTP or AWS call was made" 65
[[ "$(stat -f %z "$RAW")" == 675544895 && "$(shasum -a 256 "$RAW" | awk '{print $1}')" == 017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3 ]] || fail "Approved raw ZIP drifted; no TOTP or AWS call was made" 65
[[ "$(stat -f %z "$DERIVED")" == 899551232 && "$(shasum -a 256 "$DERIVED" | awk '{print $1}')" == 5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b ]] || fail "Approved derived GeoPackage drifted; no TOTP or AWS call was made" 65
print -- "PRECHECK passed: both approved artifacts exist at the controlled workspace-data path with exact bytes and SHA-256; no TOTP or AWS call was made."
[[ "${1:-}" == "--preflight" ]] && exit 0
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or AWS storage call was made" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77
unset totp
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$bootstrap")"; unset bootstrap
account="$(aws sts get-caller-identity --query Account --output text)" || fail "Cannot identify MFA session" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::$account:role/$ROLE" --role-session-name witness-tree-plvi-approved-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds account
TMP="$(mktemp -d /private/tmp/witness-tree-plvi-approved-promotion.XXXXXX)"; chmod 700 "$TMP"
node "$ROOT/scripts/prepare-alberta-plvi-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null
typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS
IDS=(alberta-plvi-raw-2026-08-14 alberta-plvi-full-repair-v1-2026-08-14)
FILES=("$RAW" "$DERIVED")
BYTES=(675544895 899551232)
SHAS=(017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3 5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b)
PAYLOADS=(raw/ab-primary-land-vegetation/undeclared/2026-08-14T14-01-07Z/017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3/payload/primarylandandvegetationinventoryplvi.zip derived/ab-primary-land-vegetation/alberta-plvi-full-repair-v1-2026-08-14/2026-08-14T14-14-31Z/5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b/payload/alberta-plvi-full-repaired-closed-join.gpkg)
SIDECARS=(raw/ab-primary-land-vegetation/undeclared/2026-08-14T14-01-07Z/017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3/manifest.json derived/ab-primary-land-vegetation/alberta-plvi-full-repair-v1-2026-08-14/2026-08-14T14-14-31Z/5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b/manifest.json)
for i in {1..2}; do
  aws s3 cp "${FILES[$i]}" "s3://$BUCKET/${PAYLOADS[$i]}" --region "$REGION" --only-show-errors --checksum-algorithm CRC64NVME
  aws s3 cp "$TMP/${IDS[$i]}.manifest.json" "s3://$BUCKET/${SIDECARS[$i]}" --region "$REGION" --only-show-errors --checksum-algorithm CRC64NVME
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Payload read-back failed" 70
  version="$(jq -r '.VersionId' <<<"$payload_head")"; [[ -n "$version" && "$version" != null ]] || fail "Payload version read-back missing" 70
  [[ "$(jq -r '.ContentLength' <<<"$payload_head")" == "${BYTES[$i]}" && "$(jq -r '.ChecksumCRC64NVME // empty' <<<"$payload_head")" != '' ]] || fail "Payload read-back integrity incomplete" 70
  aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --output json)" || fail "Retention read-back failed" 70
  jq -e --arg d "$RETAIN_UNTIL" '.Retention.Mode=="COMPLIANCE" and (.Retention.RetainUntilDate|startswith($d[0:10]))' <<<"$retention" >/dev/null || fail "Retention read-back mismatch" 70
  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Sidecar read-back failed" 70
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$sidecar_head" >/dev/null || fail "Sidecar read-back incomplete" 70
done
print -- "Promotion completed; capture a redacted external read-back before any source-ledger admission."
