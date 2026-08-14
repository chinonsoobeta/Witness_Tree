#!/bin/zsh
# Owner-local only. The default path is a no-write local preflight.
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
TMP=""
ACTIVE_UPLOAD_ID=""
ACTIVE_UPLOAD_KEY=""

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
cleanup() {
  local exit_status=$?
  if [[ -n "$ACTIVE_UPLOAD_ID" && -n "$ACTIVE_UPLOAD_KEY" ]]; then
    # This only abandons an unfinished upload created by this invocation; it
    # cannot delete an object version.
    aws s3api abort-multipart-upload --bucket "$BUCKET" --key "$ACTIVE_UPLOAD_KEY" --upload-id "$ACTIVE_UPLOAD_ID" --region "$REGION" >/dev/null 2>&1 || true
  fi
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
  exit "$exit_status"
}
trap cleanup EXIT

[[ ( "${1:-}" == "--preflight" || "${1:-}" == "--run" ) && $# -eq 1 ]] || fail "Usage: $0 --preflight|--run" 64
command -v shasum >/dev/null || fail "shasum is required" 69

typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS
IDS=(nrcan-ca-forest-harvest-1985-2022-2026-08-14 nrcan-forest-canopy-height-2022-2026-08-14 elections-canada-federal-electoral-districts-45th-general-election-2025-shp)
FILES=(
  "$DATA_ROOT/raw/nrcan-ca-forest-harvest-1985-2022/2026-08-14/CA_Forest_Harvest_1985-2022.zip"
  "$DATA_ROOT/raw/nrcan-forest-canopy-height-2022/2026-08-14/CA_canopy_height_2022.zip"
  "$DATA_ROOT/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip"
)
BYTES=(247945479 10347564066 10301648)
SHAS=(c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad 86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124 4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93)
PAYLOADS=(
  raw/nrcan-ca-forest-harvest-1985-2022/undeclared/2026-08-14T09-27-41Z/c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad/payload/ca_forest_harvest_1985-2022.zip
  raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip
  raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip
)
SIDECARS=(
  raw/nrcan-ca-forest-harvest-1985-2022/undeclared/2026-08-14T09-27-41Z/c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad/manifest.json
  raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json
  raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/manifest.json
)

for i in {1..3}; do
  [[ -f "${FILES[$i]}" ]] || fail "Approved local payload is missing; no TOTP or AWS call was made" 65
  [[ "$(stat -f %z "${FILES[$i]}")" == "${BYTES[$i]}" ]] || fail "Approved byte length drifted; no TOTP or AWS call was made" 65
  [[ "$(shasum -a 256 "${FILES[$i]}" | awk '{print $1}')" == "${SHAS[$i]}" ]] || fail "Approved SHA-256 drifted; no TOTP or AWS call was made" 65
done
print -- "PRECHECK passed: all three approved artifacts exist at the controlled workspace-data path with exact bytes and SHA-256; no TOTP or AWS call was made."
[[ "$1" == "--preflight" ]] && exit 0

command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or storage call was made" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77
unset totp
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"; unset bootstrap
account="$(aws sts get-caller-identity --query Account --output text)" || fail "Cannot identify MFA session" 77
[[ "$account" == 286853118812 ]] || fail "MFA session is not in the approved account" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::${account}:role/${ROLE}" --role-session-name witness-tree-approved-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$creds")"; unset creds account
TMP="$(mktemp -d /private/tmp/witness-tree-approved-promotion.XXXXXX)"; chmod 700 "$TMP"

upload_multipart() {
  local file="$1" key="$2" bytes="$3" result part_size=67108864 part_count part_index part_number part_file parts_file create complete etag
  create="$(aws s3api create-multipart-upload --bucket "$BUCKET" --key "$key" --checksum-algorithm CRC64NVME --region "$REGION" --output json)" || fail "Multipart creation failed" 70
  ACTIVE_UPLOAD_ID="$(jq -er '.UploadId' <<<"$create")"; ACTIVE_UPLOAD_KEY="$key"
  part_count=$(( (bytes + part_size - 1) / part_size ))
  parts_file="$TMP/parts.json"; print -n -- '{"Parts":[' > "$parts_file"
  for ((part_index = 0; part_index < part_count; part_index++)); do
    part_number=$((part_index + 1)); part_file="$TMP/part-${part_number}"
    dd if="$file" of="$part_file" bs="$part_size" skip="$part_index" count=1 2>/dev/null || fail "Could not prepare multipart part" 70
    print -- "Uploading canopy part ${part_number}/${part_count}; do not interrupt."
    result="$(aws s3api upload-part --bucket "$BUCKET" --key "$key" --upload-id "$ACTIVE_UPLOAD_ID" --part-number "$part_number" --body "$part_file" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Multipart part upload failed" 70
    etag="$(jq -er '.ETag' <<<"$result")" || fail "Multipart part acknowledgement incomplete" 70
    (( part_number > 1 )) && print -n -- ',' >> "$parts_file"
    jq -cn --arg ETag "$etag" --argjson PartNumber "$part_number" '{ETag:$ETag,PartNumber:$PartNumber}' >> "$parts_file"
    rm -f "$part_file"
  done
  print -- ']}' >> "$parts_file"
  complete="$(aws s3api complete-multipart-upload --bucket "$BUCKET" --key "$key" --upload-id "$ACTIVE_UPLOAD_ID" --multipart-upload "file://$parts_file" --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Multipart completion failed" 70
  ACTIVE_UPLOAD_ID=""; ACTIVE_UPLOAD_KEY=""
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$complete" >/dev/null || fail "Multipart completion acknowledgement incomplete" 70
}

for i in {1..3}; do
  # GetObject is granted on every exact approved key. A successful read means
  # a version already exists, which this append-only runner refuses to replace.
  if aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/preexisting-${i}.json" 2>"$TMP/preexisting-${i}.stderr"; then
    fail "An approved payload key already has a version; no replacement was attempted. Preserve the diagnostic and request a version-specific audit." 73
  fi
  sidecar="$TMP/${IDS[$i]}.manifest.json"
  jq -n --arg id "${IDS[$i]}" --arg payload "${PAYLOADS[$i]}" --arg sha "${SHAS[$i]}" --argjson bytes "${BYTES[$i]}" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$sidecar"
  if (( ${BYTES[$i]} > 5368709120 )); then
    print -- "Uploading approved 10.35 GB canopy payload with explicit 64 MiB multipart requests."
    upload_multipart "${FILES[$i]}" "${PAYLOADS[$i]}" "${BYTES[$i]}"
  else
    print -- "Uploading approved payload ${i}/3 by one direct S3 request; wait for the acknowledgement."
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Payload upload failed" 70
    jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$put" >/dev/null || fail "Payload upload acknowledgement incomplete" 70
  fi
  sidecar_put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$sidecar" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Sidecar upload failed" 70
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$sidecar_put" >/dev/null || fail "Sidecar upload acknowledgement incomplete" 70
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Payload read-back failed" 70
  version="$(jq -er '.VersionId' <<<"$payload_head")"; [[ "$(jq -r '.ContentLength' <<<"$payload_head")" == "${BYTES[$i]}" && "$(jq -r '.ChecksumCRC64NVME // empty' <<<"$payload_head")" != "" ]] || fail "Payload read-back integrity incomplete" 70
  aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "COMPLIANCE retention application failed" 70
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --output json)" || fail "Retention read-back failed" 70
  jq -e --arg d "$RETAIN_UNTIL" '.Retention.Mode == "COMPLIANCE" and (.Retention.RetainUntilDate | startswith($d[0:10]))' <<<"$retention" >/dev/null || fail "Retention read-back mismatch" 70
  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Sidecar read-back failed" 70
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$sidecar_head" >/dev/null || fail "Sidecar read-back incomplete" 70
done
print -- "Promotion completed. Preserve the Terminal output for the required redacted, version-specific audit."
