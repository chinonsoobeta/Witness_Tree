#!/bin/zsh
set -euo pipefail
umask 077

# Owner-local only. No argument is a dry run. --run needs a separate fresh approval.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeCurrentWildfirePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
[[ "${1:-}" == "--preflight" && -n "${WITNESS_TREE_CURRENT_WILDFIRE_PREFLIGHT_DATA_ROOT:-}" ]] && DATA_ROOT="$WITNESS_TREE_CURRENT_WILDFIRE_PREFLIGHT_DATA_ROOT"
TMP=""
cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds totp; [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }

if [[ $# -eq 0 ]]; then node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs"; exit 0; fi
[[ ( "${1:-}" == "--preflight" || "${1:-}" == "--run" ) && $# -eq 1 ]] || fail "Usage: $0 [--preflight|--run]" 64
command -v shasum >/dev/null || fail "shasum is required" 69
node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs" >/dev/null
typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS
IDS=(cwfis-current-active-wildfires-2026-08-14T202242Z bc-wildfire-current-perimeters-2026-08-14 alberta-wildfire-locations-2026-08-14 ontario-in-year-fire-perimeters-2026-08-14)
FILES=("$DATA_ROOT/raw/cwfis-current-active-fires/2026-08-14/cwfif_national_activefires_2026-08-14T202242Z.zip" "$DATA_ROOT/raw/bc-wildfire-fire-perimeters/2026-08-14/bc-wildfire-fire-perimeters_2026-08-14.geojson" "$DATA_ROOT/raw/alberta-wildfire-locations/2026-08-14/alberta-wildfire-locations_2026-08-14.geojson" "$DATA_ROOT/raw/ontario-in-year-fire-perimeters/2026-08-14/ontario-in-year-fire-perimeters_2026-08-14.geojson")
BYTES=(45917 4813292 423853 19510504)
SHAS=(fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86 46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83 f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0 99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11)
PAYLOADS=(raw/cwfis-current/undeclared/2026-08-14T20-24-34Z/fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86/payload/cwfif_national_activefires_2026-08-14t202242z.zip raw/bc-wildfire/undeclared/2026-08-14T20-31-39Z/46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83/payload/bc-wildfire-fire-perimeters_2026-08-14.geojson raw/ab-wildfire/undeclared/2026-08-14T13-42-09Z/f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0/payload/alberta-wildfire-locations_2026-08-14.geojson raw/on-fire-disturbance/undeclared/2026-08-14T13-49-36Z/99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11/payload/ontario-in-year-fire-perimeters_2026-08-14.geojson)
SIDECARS=(raw/cwfis-current/undeclared/2026-08-14T20-24-34Z/fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86/manifest.json raw/bc-wildfire/undeclared/2026-08-14T20-31-39Z/46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83/manifest.json raw/ab-wildfire/undeclared/2026-08-14T13-42-09Z/f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0/manifest.json raw/on-fire-disturbance/undeclared/2026-08-14T13-49-36Z/99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11/manifest.json)
for i in {1..4}; do
  [[ -f "${FILES[$i]}" && "$(stat -f %z "${FILES[$i]}")" == "${BYTES[$i]}" && "$(shasum -a 256 "${FILES[$i]}" | awk '{print $1}')" == "${SHAS[$i]}" ]] || fail "Approved ${IDS[$i]} artifact drifted or is missing; no TOTP or AWS call was made" 65
done
print -- "PRECHECK passed: four approved current-wildfire artifacts have exact bytes and SHA-256; no TOTP or AWS call was made."
[[ "${1:-}" == "--preflight" ]] && exit 0
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator$' ]] || fail "Configured MFA serial is absent or does not name the approved operator; no STS or AWS storage call was made" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77; unset totp
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$bootstrap")"; unset bootstrap
account="$(aws sts get-caller-identity --query Account --output text)" || fail "Cannot identify MFA session" 77
[[ "$account" == "286853118812" ]] || fail "MFA session is outside the approved account" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::${account}:role/${ROLE}" --role-session-name witness-tree-current-wildfire-approved-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds account
TMP="$(mktemp -d /private/tmp/witness-tree-current-wildfire-approved-promotion.XXXXXX)"; chmod 700 "$TMP"
node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null
for i in {1..4}; do
  print -- "Uploading approved raw payload $i/4 by direct PutObject; wait for its acknowledgement."
  payload_put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Payload upload failed" 70
  version="$(jq -r '.VersionId // empty' <<<"$payload_put")"; [[ -n "$version" && "$(jq -r '.ChecksumCRC64NVME // empty' <<<"$payload_put")" != "" ]] || fail "Payload upload acknowledgement incomplete" 70
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Payload read-back failed" 70
  jq -e --arg v "$version" --argjson n "${BYTES[$i]}" '.VersionId==$v and .ContentLength==$n and .ChecksumType=="FULL_OBJECT" and (.ChecksumCRC64NVME // empty)!=""' <<<"$payload_head" >/dev/null || fail "Payload read-back lacks exact version, bytes, or FULL_OBJECT CRC64NVME" 70
  aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Payload COMPLIANCE retention failed" 70
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --output json)" || fail "Retention read-back failed" 70
  jq -e --arg until "$RETAIN_UNTIL" '.Retention.Mode == "COMPLIANCE" and (.Retention.RetainUntilDate | startswith($until[0:10]))' <<<"$retention" >/dev/null || fail "Payload retention read-back mismatch" 70
  sidecar_put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$TMP/${IDS[$i]}.manifest.json" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Sidecar upload failed" 70
  sidecar_version="$(jq -r '.VersionId // empty' <<<"$sidecar_put")"; [[ -n "$sidecar_version" && "$(jq -r '.ChecksumCRC64NVME // empty' <<<"$sidecar_put")" != "" ]] || fail "Sidecar upload acknowledgement incomplete" 70
  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Sidecar read-back failed"; jq -e --arg v "$sidecar_version" '.VersionId==$v and .ChecksumType=="FULL_OBJECT" and (.ChecksumCRC64NVME // empty)!=""' <<<"$sidecar_head" >/dev/null || fail "Sidecar read-back lacks exact version or FULL_OBJECT CRC64NVME" 70
done
print -- "Archive promotion completed; this is raw archive evidence only and does not clear BC or Ontario geometry admission blocks."
