#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"
source "${0:A:h}/archive-existing-key-recovery.sh"

# Owner-local only. Default is a pure dry run; --run requires the separate exact approval.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreePlviArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/alberta-plvi-immutable-promotion-preparation.json"
LEGACY_MANIFEST_COMPARATOR="$ROOT/scripts/check-alberta-plvi-legacy-manifest-audit.mjs"
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
creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-plvi-approved-promotion)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds
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
  label="plvi-${IDS[$i]}"; sidecar="$TMP/${IDS[$i]}.manifest.json"; payload_present=0; manifest_present=0
  if wt_archive_head_current_or_absent "${PAYLOADS[$i]}" "$label-payload"; then payload_present=1; version="$WT_ARCHIVE_VERSION"; fi
  if wt_archive_head_current_or_absent "${SIDECARS[$i]}" "$label-manifest"; then manifest_present=1; sidecar_version="$WT_ARCHIVE_VERSION"; fi
  (( ! payload_present && manifest_present )) && fail "A manifest exists without its approved PLVI payload; recovery is ambiguous and no write was attempted" 73
  if (( payload_present )); then wt_archive_verify_existing_payload "${PAYLOADS[$i]}" "$version" "${BYTES[$i]}" "${SHAS[$i]}" "$label-payload"
  else
    print -- "Uploading absent approved PLVI payload $i/2 by conditional direct PutObject."
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --if-none-match '*' --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "PLVI payload was not provably absent; no duplicate was written" 70
    version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "PLVI payload acknowledgement has no concrete version" 70
    wt_archive_verify_existing_payload "${PAYLOADS[$i]}" "$version" "${BYTES[$i]}" "${SHAS[$i]}" "$label-payload"
  fi
  if (( manifest_present )); then wt_archive_verify_existing_manifest_with_legacy_comparator "${SIDECARS[$i]}" "$sidecar_version" "$sidecar" "$label-manifest" "$LEGACY_MANIFEST_COMPARATOR"
  else
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$sidecar" --if-none-match '*' --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "PLVI manifest was not provably absent; no duplicate was written" 70
    sidecar_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "PLVI manifest acknowledgement has no concrete version" 70
    wt_archive_verify_existing_manifest "${SIDECARS[$i]}" "$sidecar_version" "$sidecar" "$label-manifest"
  fi
  wt_archive_ensure_compliance_retention "${PAYLOADS[$i]}" "$version" "$label-payload"
  wt_archive_ensure_compliance_retention "${SIDECARS[$i]}" "$sidecar_version" "$label-manifest"
done
print -- "Promotion completed; capture a redacted external read-back before any source-ledger admission."
