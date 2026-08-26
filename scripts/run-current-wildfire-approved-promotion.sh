#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"
source "${0:A:h}/archive-existing-key-recovery.sh"

# Owner-local only. No argument is a dry run. --run is limited to the exact
# recorded approval and still requires fresh MFA plus exact readback evidence.
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
creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-current-wildfire-approved-promotion)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds
TMP="$(mktemp -d /private/tmp/witness-tree-current-wildfire-approved-promotion.XXXXXX)"; chmod 700 "$TMP"
node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null
for i in {1..4}; do
  label="current-${IDS[$i]}"; sidecar="$TMP/${IDS[$i]}.manifest.json"; payload_present=0; manifest_present=0
  if wt_archive_head_current_or_absent "${PAYLOADS[$i]}" "$label-payload"; then payload_present=1; version="$WT_ARCHIVE_VERSION"; fi
  if wt_archive_head_current_or_absent "${SIDECARS[$i]}" "$label-manifest"; then manifest_present=1; sidecar_version="$WT_ARCHIVE_VERSION"; fi
  (( ! payload_present && manifest_present )) && fail "A manifest exists without its approved current-wildfire payload; recovery is ambiguous and no write was attempted" 73
  if (( payload_present )); then wt_archive_verify_existing_payload "${PAYLOADS[$i]}" "$version" "${BYTES[$i]}" "${SHAS[$i]}" "$label-payload"
  else
    print -- "Uploading absent approved current-wildfire payload $i/4 by conditional direct PutObject."
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --if-none-match '*' --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Current-wildfire payload was not provably absent; no duplicate was written" 70
    version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "Current-wildfire payload acknowledgement has no concrete version" 70
    wt_archive_verify_existing_payload "${PAYLOADS[$i]}" "$version" "${BYTES[$i]}" "${SHAS[$i]}" "$label-payload"
  fi
  if (( manifest_present )); then wt_archive_verify_existing_manifest "${SIDECARS[$i]}" "$sidecar_version" "$sidecar" "$label-manifest"
  else
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$sidecar" --if-none-match '*' --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Current-wildfire manifest was not provably absent; no duplicate was written" 70
    sidecar_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "Current-wildfire manifest acknowledgement has no concrete version" 70
    wt_archive_verify_existing_manifest "${SIDECARS[$i]}" "$sidecar_version" "$sidecar" "$label-manifest"
  fi
  wt_archive_ensure_compliance_retention "${PAYLOADS[$i]}" "$version" "$label-payload"
  wt_archive_ensure_compliance_retention "${SIDECARS[$i]}" "$sidecar_version" "$label-manifest"
done
print -- "Archive promotion completed; this is raw archive evidence only and does not clear BC or Ontario geometry admission blocks."
