#!/bin/zsh
set -euo pipefail
umask 077

# Owner-local only.  This intentionally contains neither a TOTP nor credentials.
PROFILE="WitnessTreeArchiveOperator"
REGION="ca-central-1"
BUCKET="witness-tree-raw-archive-ca-central-1"
ROLE="WitnessTreeArchivePromotionUploader"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /private/tmp/witness-tree-approved-promotion.XXXXXX)"
chmod 700 "$TMP"
trap 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN; rm -rf "$TMP"' EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
[[ "${1:-}" == "--run" && $# -eq 1 ]] || fail "Usage: $0 --run" 64
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
command -v shasum >/dev/null || fail "shasum is required" 69

typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS
IDS=(nrcan-ca-forest-harvest-1985-2022-2026-08-14 nrcan-forest-canopy-height-2022-2026-08-14 elections-canada-federal-electoral-districts-45th-general-election-2025-shp)
FILES=(/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/raw/nrcan-ca-forest-harvest-1985-2022/2026-08-14/CA_Forest_Harvest_1985-2022.zip /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/raw/nrcan-forest-canopy-height-2022/2026-08-14/CA_canopy_height_2022.zip /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip)
BYTES=(247945479 10347564066 10301648)
SHAS=(c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad 86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124 4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93)
PAYLOADS=(raw/nrcan-ca-forest-harvest-1985-2022/undeclared/2026-08-14T09-27-41Z/c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad/payload/ca_forest_harvest_1985-2022.zip raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip)
SIDECARS=(raw/nrcan-ca-forest-harvest-1985-2022/undeclared/2026-08-14T09-27-41Z/c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad/manifest.json raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/manifest.json)
for i in {1..3}; do
  [[ -f "${FILES[$i]}" ]] || fail "Approved local payload is missing" 65
  [[ "$(stat -f %z "${FILES[$i]}")" == "${BYTES[$i]}" ]] || fail "Approved byte length drifted" 65
  [[ "$(shasum -a 256 "${FILES[$i]}" | awk '{print $1}')" == "${SHAS[$i]}" ]] || fail "Approved SHA-256 drifted" 65
  [[ "${SIDECARS[$i]}" == raw/*/manifest.json ]] || fail "Canonical sidecar key drifted" 65
done

vared -p 'Current MFA TOTP (not stored): ' -s totp
[[ "$totp" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws iam list-mfa-devices --user-name WitnessTreeArchiveOperator --profile "$PROFILE" --query 'MFADevices[0].SerialNumber' --output text)" || fail "Cannot read configured MFA serial" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77
unset totp
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$bootstrap")"; unset bootstrap
account="$(aws sts get-caller-identity --query Account --output text)" || fail "Cannot identify MFA session" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::$account:role/$ROLE" --role-session-name witness-tree-approved-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds account
for i in {1..3}; do
  sidecar="$TMP/${IDS[$i]}.manifest.json"
  jq -n --arg id "${IDS[$i]}" --arg payload "${PAYLOADS[$i]}" --arg sha "${SHAS[$i]}" --argjson bytes "${BYTES[$i]}" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$sidecar"
  aws s3 cp "${FILES[$i]}" "s3://$BUCKET/${PAYLOADS[$i]}" --region "$REGION" --only-show-errors --checksum-algorithm CRC64NVME
  aws s3 cp "$sidecar" "s3://$BUCKET/${SIDECARS[$i]}" --region "$REGION" --only-show-errors --checksum-algorithm CRC64NVME
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Payload readback failed" 70
  version="$(jq -r '.VersionId' <<<"$payload_head")"; [[ -n "$version" && "$version" != null ]] || fail "Payload version readback missing" 70
  [[ "$(jq -r '.ContentLength' <<<"$payload_head")" == "${BYTES[$i]}" ]] || fail "Payload bytes mismatch" 70
  [[ "$(jq -r '.ChecksumCRC64NVME // empty' <<<"$payload_head")" != '' ]] || fail "Payload full-object CRC64NVME missing" 70
  aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --output json)" || fail "Retention readback failed" 70
  jq -e --arg d "$RETAIN_UNTIL" '.Retention.Mode=="COMPLIANCE" and (.Retention.RetainUntilDate|startswith($d[0:10]))' <<<"$retention" >/dev/null || fail "Retention readback mismatch" 70
  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Sidecar readback failed" 70
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$sidecar_head" >/dev/null || fail "Sidecar readback incomplete" 70
done
jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retainUntil "$RETAIN_UNTIL" '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",approvedArtifacts:3,payloads:{bytesAndSha256Verified:true,fullObjectCrc64nvmeReadBack:true,complianceRetentionReadBack:true},sidecars:{uploadedAndVersioned:true,checksumReadBack:true},retainUntil:$retainUntil,productionEligible:false}' > "$TMP/redacted-promotion-readback.json"
print -- "Promotion completed. Redacted evidence is at: $TMP/redacted-promotion-readback.json"
