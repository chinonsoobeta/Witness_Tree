#!/bin/zsh
# Owner-local only. The default path is a no-write local preflight.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
TMP=""
ACTIVE_UPLOAD_ID=""
ACTIVE_UPLOAD_KEY=""
RESUME_STATE=""
RESUME_UPLOAD_ID=""
RESUME_PARTS=""
MODE=""

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
cleanup() {
  local exit_status=$?
  # Preserve unfinished multipart state. A failed or expired session must be
  # resumed from its verified private recovery record, never discarded.
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"
  exit "$exit_status"
}
trap cleanup EXIT

if [[ ( "${1:-}" == "--resume" || "${1:-}" == "--validate-resume-state" ) && $# -eq 2 ]]; then
  [[ "${1:-}" == "--resume" ]] && MODE="resume" || MODE="validate-resume"
  RESUME_STATE="$2"
elif [[ ( "${1:-}" == "--preflight" || "${1:-}" == "--run" || "${1:-}" == "--run-federal" ) && $# -eq 1 ]]; then
  MODE="${1#--}"
else
  fail "Usage: $0 --preflight|--run|--run-federal|--resume /absolute/private-state.json|--validate-resume-state /absolute/private-state.json" 64
fi
command -v shasum >/dev/null || fail "shasum is required" 69

typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS PROMOTION_INDICES
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
[[ "$MODE" == "preflight" ]] && exit 0
if [[ "$MODE" == "run-federal" ]]; then
  # Harvest is already archived and the canopy prefix is resumed separately;
  # this explicit mode cannot revisit either completed/preserved artifact.
  PROMOTION_INDICES=(3)
else
  PROMOTION_INDICES=(1 2 3)
fi

command -v jq >/dev/null || fail "jq is required" 69
SESSION_EXPIRES_EPOCH=0
prompt_and_assume() {
  local creds expiration
  creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-approved-promotion)"
  expiration="$(jq -er '.Credentials.Expiration' <<<"$creds")" || fail "Promotion session expiry is absent" 77
  SESSION_EXPIRES_EPOCH="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$expiration" +%s 2>/dev/null || print 0)"
  export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$creds")"; unset creds expiration
}

resume_aws() {
  local output
  if ! output="$(aws "$@" 2>"$TMP/resume.stderr")"; then
    if grep -q 'ExpiredToken\|ExpiredTokenException' "$TMP/resume.stderr"; then
      fail "AWS session expired; private resume state was preserved unchanged. Resume with: $0 --resume $RESUME_STATE" 75
    fi
    fail "Resume AWS call failed; private resume state was preserved unchanged." 70
  fi
  print -r -- "$output"
}
write_resume_state() {
  local parts="$1" state_tmp
  state_tmp="${RESUME_STATE}.tmp.$$"
  (umask 077; jq -n --arg bucket "$BUCKET" --arg region "$REGION" --arg key "${PAYLOADS[2]}" --arg uploadId "$RESUME_UPLOAD_ID" --argjson parts "$parts" '{schemaVersion:1,bucket:$bucket,region:$region,key:$key,uploadId:$uploadId,partSize:67108864,parts:$parts}' > "$state_tmp") || fail "Could not persist private resume state" 70
  chmod 600 "$state_tmp" && mv -f "$state_tmp" "$RESUME_STATE" || fail "Could not replace private resume state" 70
}
prepare_resume_state() {
  local state_json canopy_bytes="${BYTES[2]}" part_size=67108864 part_count final_size
  part_count=$(( (canopy_bytes + part_size - 1) / part_size ))
  final_size=$(( canopy_bytes - part_size * (part_count - 1) ))
  [[ "$RESUME_STATE" == /* && -f "$RESUME_STATE" && -O "$RESUME_STATE" && "$(stat -f %Lp "$RESUME_STATE")" == 600 ]] || fail "Private resume state must be an owner-owned mode-600 absolute-path file; no storage call was made" 65
  state_json="$(<"$RESUME_STATE")"
  jq -e --arg bucket "$BUCKET" --arg region "$REGION" --arg key "${PAYLOADS[2]}" --argjson partSize "$part_size" --argjson partCount "$part_count" --argjson finalSize "$final_size" '
    .schemaVersion == 1 and .bucket == $bucket and .region == $region and .key == $key and
    (.uploadId|type=="string" and length>20) and .partSize == $partSize and
    (.parts|type=="array" and length >= 1 and length <= $partCount and
      all(to_entries[];
        .key + 1 == .value.PartNumber and
        .value.Size == (if .value.PartNumber == $partCount then $finalSize else $partSize end) and
        (.value.ETag|type=="string" and test("^\\\"[^\\\"]+\\\"$")) and
        (.value.ChecksumCRC64NVME|type=="string" and test("^[A-Za-z0-9+/]{11}=$"))
      )
    )
  ' <<<"$state_json" >/dev/null || fail "Private resume state does not bind the exact approved canopy upload; no storage call was made" 65
  RESUME_UPLOAD_ID="$(jq -er '.uploadId' <<<"$state_json")"
  # ListParts may include provider-only metadata such as LastModified. It is
  # not part of the resumable binding or a valid completion member; compare
  # the same four acknowledged fields that the remote projection uses.
  RESUME_PARTS="$(jq -c '[.parts[] | {PartNumber,ETag,ChecksumCRC64NVME,Size}]' <<<"$state_json")"
}
resume_canopy() {
  local listed state_parts="$RESUME_PARTS" remote_parts bytes="${BYTES[2]}" part_size=67108864 part_count first_missing part_number part_file result etag checksum parts_file complete version payload_crc sidecar sidecar_bytes sidecar_put sidecar_version sidecar_crc payload_head retention sidecar_head
  part_count=$(( (bytes + part_size - 1) / part_size ))
  listed="$(resume_aws s3api list-parts --bucket "$BUCKET" --key "${PAYLOADS[2]}" --upload-id "$RESUME_UPLOAD_ID" --region "$REGION" --output json)"
  jq -e '(.IsTruncated // false) == false and (.Parts|type == "array")' <<<"$listed" >/dev/null || fail "Remote multipart parts response is incomplete; no new part was uploaded" 70
  remote_parts="$(jq -c '[.Parts[] | {PartNumber,ETag,ChecksumCRC64NVME,Size}]' <<<"$listed")"
  [[ "$remote_parts" == "$state_parts" ]] || fail "Remote multipart parts do not exactly match private resume state; no new part was uploaded" 70
  first_missing=$(( $(jq 'length' <<<"$state_parts") + 1 ))
  for ((part_number = first_missing; part_number <= part_count; part_number++)); do
    (( SESSION_EXPIRES_EPOCH == 0 || $(date +%s) + 300 < SESSION_EXPIRES_EPOCH )) || { print -- "Phase: refresh short-lived MFA session before expiry"; prompt_and_assume; }
    part_file="$TMP/resume-part-${part_number}"
    dd if="${FILES[2]}" of="$part_file" bs="$part_size" skip=$((part_number - 1)) count=1 2>/dev/null || fail "Could not prepare canopy resume part; state preserved" 70
    print -- "Resuming approved canopy part ${part_number}/${part_count}; private state is being persisted."
    result="$(resume_aws s3api upload-part --bucket "$BUCKET" --key "${PAYLOADS[2]}" --upload-id "$RESUME_UPLOAD_ID" --part-number "$part_number" --body "$part_file" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)"
    rm -f "$part_file"; etag="$(jq -er '.ETag' <<<"$result")"; checksum="$(jq -er '.ChecksumCRC64NVME' <<<"$result")" || fail "Resumed part acknowledgement incomplete; state preserved" 70
    [[ "$etag" =~ '^"[a-f0-9]{32}"$' && "$checksum" =~ '^[A-Za-z0-9+/]{11}=$' ]] || fail "Resumed part acknowledgement has an invalid ETag or CRC64NVME; state preserved" 70
    state_parts="$(jq -cn --argjson prior "$state_parts" --arg ETag "$etag" --arg ChecksumCRC64NVME "$checksum" --argjson PartNumber "$part_number" --argjson Size "$(( part_number == part_count ? bytes - part_size * (part_count - 1) : part_size ))" '$prior + [{PartNumber:$PartNumber,ETag:$ETag,ChecksumCRC64NVME:$ChecksumCRC64NVME,Size:$Size}]')"
    write_resume_state "$state_parts"
  done
  # Size is required in the private state and ListParts comparison, but it is
  # not a valid CompleteMultipartUpload.Parts member. Project only the three
  # acknowledgement fields accepted by S3 so a fully uploaded resume can
  # complete without changing, re-uploading, or discarding any part.
  parts_file="$TMP/resume-parts.json"
  jq -n --argjson parts "$state_parts" \
    '{Parts: [$parts[] | {PartNumber, ETag, ChecksumCRC64NVME}]}' > "$parts_file"
  complete="$(resume_aws s3api complete-multipart-upload --bucket "$BUCKET" --key "${PAYLOADS[2]}" --upload-id "$RESUME_UPLOAD_ID" --multipart-upload "file://$parts_file" --region "$REGION" --cli-read-timeout 0 --output json)"
  version="$(jq -er '.VersionId' <<<"$complete")"; payload_crc="$(jq -er 'select(.ChecksumType == "FULL_OBJECT") | .ChecksumCRC64NVME' <<<"$complete")" || fail "Multipart completion acknowledgement lacks FULL_OBJECT CRC64NVME; state preserved" 70
  sidecar="$TMP/${IDS[2]}.manifest.json"; jq -n --arg id "${IDS[2]}" --arg payload "${PAYLOADS[2]}" --arg sha "${SHAS[2]}" --argjson bytes "${BYTES[2]}" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$sidecar"
  sidecar_bytes="$(stat -f %z "$sidecar")"
  sidecar_put="$(resume_aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[2]}" --body "$sidecar" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)"; sidecar_version="$(jq -er '.VersionId' <<<"$sidecar_put")"; sidecar_crc="$(jq -er '.ChecksumCRC64NVME' <<<"$sidecar_put")" || fail "Sidecar upload acknowledgement incomplete; state preserved" 70
  payload_head="$(resume_aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[2]}" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)"; jq -e --arg version "$version" --arg crc "$payload_crc" --argjson bytes "$bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumCRC64NVME == $crc' <<<"$payload_head" >/dev/null || fail "Payload exact-version read-back lacks exact bytes or matching FULL_OBJECT CRC64NVME" 70
  resume_aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[2]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null
  resume_aws s3api put-object-retention --bucket "$BUCKET" --key "${SIDECARS[2]}" --version-id "$sidecar_version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null
  retention="$(resume_aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[2]}" --version-id "$version" --region "$REGION" --output json)"; jq -e '.Retention.Mode == "COMPLIANCE"' <<<"$retention" >/dev/null && node -e 'const [a,b]=process.argv.slice(1).map(Date.parse); if (!Number.isFinite(a) || a !== b) process.exit(1)' "$(jq -er '.Retention.RetainUntilDate' <<<"$retention")" "$RETAIN_UNTIL" || fail "Retention read-back mismatch" 70
  sidecar_head="$(resume_aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[2]}" --version-id "$sidecar_version" --checksum-mode ENABLED --region "$REGION" --output json)"; jq -e --arg version "$sidecar_version" --arg crc "$sidecar_crc" --argjson bytes "$sidecar_bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumCRC64NVME == $crc' <<<"$sidecar_head" >/dev/null || fail "Sidecar exact-version read-back lacks exact bytes or matching FULL_OBJECT CRC64NVME" 70
  print -- "Canopy multipart resume completed with required read-backs; do not infer source admission."
}

if [[ "$MODE" == "resume" || "$MODE" == "validate-resume" ]]; then
  # Validate the private recovery record before prompting for an MFA code or
  # opening any AWS session. It is never repaired or normalized in place.
  prepare_resume_state
fi
if [[ "$MODE" == "validate-resume" ]]; then
  print -- "Private canopy resume state validation passed; no TOTP or AWS call was made."
  exit 0
fi
command -v aws >/dev/null || fail "aws CLI is required" 69
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
print -- "Phase: obtain a short-lived MFA session"
prompt_and_assume
TMP="$(mktemp -d /private/tmp/witness-tree-approved-promotion.XXXXXX)"; chmod 700 "$TMP"

if [[ "$MODE" == "resume" ]]; then resume_canopy; exit 0; fi

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

# The federal-only command is allowed to recover a stopped run.  This is
# deliberately separate from the generic --run path: the latter remains an
# append-only batch command and still refuses every pre-existing payload.
# A failed HeadObject is only treated as absence when S3 says so explicitly;
# permissions, network failures, and malformed diagnostics must never open a
# write path.
RESOLVED_HEAD=""
RESOLVED_VERSION=""
head_current_or_absent() {
  local key="$1" label="$2" head_file error_file
  head_file="$TMP/federal-${label}.head.json"
  error_file="$TMP/federal-${label}.head.stderr"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$head_file" 2>"$error_file"; then
    RESOLVED_HEAD="$(<"$head_file")"
    RESOLVED_VERSION="$(jq -er '.VersionId | select(type == "string" and length > 0 and . != "null")' <<<"$RESOLVED_HEAD")" || fail "Existing ${label} has no concrete version ID; recovery refused" 73
    return 0
  fi
  if grep -Eqi '(^|[^[:alnum:]])(404|not[[:space:]-]*found|nosuchkey|nosuchobject)([^[:alnum:]]|$)' "$error_file"; then
    RESOLVED_HEAD=""; RESOLVED_VERSION=""; return 1
  fi
  fail "Could not resolve whether the approved ${label} exists; recovery refused without a write" 73
}

verify_existing_payload() {
  local key="$1" version="$2" bytes="$3" sha="$4" exact downloaded
  exact="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Could not read the resolved payload version; recovery refused" 73
  jq -e --arg version "$version" --argjson bytes "$bytes" '
    .VersionId == $version and .ContentLength == $bytes and
    .ChecksumType == "FULL_OBJECT" and
    (.ChecksumCRC64NVME | type == "string" and test("^[A-Za-z0-9+/]+={0,2}$"))
  ' <<<"$exact" >/dev/null || fail "Existing payload version does not have the approved bytes and provider checksum; recovery refused" 73
  downloaded="$TMP/federal-existing-payload"
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" "$downloaded" >/dev/null || fail "Could not download the resolved payload version; recovery refused" 73
  [[ "$(shasum -a 256 "$downloaded" | awk '{print $1}')" == "$sha" ]] || fail "Existing payload bytes do not match the approved SHA-256; recovery refused" 73
}

verify_existing_manifest() {
  local key="$1" version="$2" expected="$3" downloaded="$TMP/federal-existing-manifest.json" exact expected_bytes
  expected_bytes="$(stat -f %z "$expected")"
  exact="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Could not read the resolved manifest version; recovery refused" 73
  jq -e --arg version "$version" --argjson bytes "$expected_bytes" '
    .VersionId == $version and .ContentLength == $bytes and
    .ChecksumType == "FULL_OBJECT" and
    (.ChecksumCRC64NVME | type == "string" and test("^[A-Za-z0-9+/]+={0,2}$"))
  ' <<<"$exact" >/dev/null || fail "Existing manifest version metadata is not the deterministic approved manifest; recovery refused" 73
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" "$downloaded" >/dev/null || fail "Could not read the resolved manifest content; recovery refused" 73
  cmp -s "$expected" "$downloaded" || fail "Existing manifest content differs from the deterministic approved manifest; recovery refused" 73
}

ensure_compliance_retention() {
  local key="$1" version="$2" label="$3" retention mode until retention_stderr
  retention_stderr="$TMP/federal-${label}.retention.stderr"
  if ! retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json 2>"$retention_stderr")"; then
    # These are the only provider diagnostics treated as a missing retention
    # record. Everything else, including access and transport failures, is an
    # ambiguous state and therefore a hard stop before any mutation.
    grep -Eqi 'NoSuchObjectLockConfiguration|NoSuchRetentionConfiguration' "$retention_stderr" || fail "Could not read ${label} retention; recovery refused" 73
    retention='{"Retention":{}}'
  fi
  mode="$(jq -r '.Retention.Mode // empty' <<<"$retention")"
  until="$(jq -r '.Retention.RetainUntilDate // empty' <<<"$retention")"
  if [[ -z "$mode" && -z "$until" ]]; then
    aws s3api put-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Could not apply missing COMPLIANCE retention to ${label}" 70
  elif [[ "$mode" != "COMPLIANCE" ]] || ! node -e 'const [actual, required] = process.argv.slice(1).map(Date.parse); process.exit(Number.isFinite(actual) && Number.isFinite(required) && actual >= required ? 0 : 1)' "$until" "$RETAIN_UNTIL"; then
    fail "Existing ${label} retention is not sufficient COMPLIANCE retention; recovery refused" 73
  fi
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json)" || fail "Could not read back ${label} retention" 70
  jq -e '.Retention.Mode == "COMPLIANCE" and (.Retention.RetainUntilDate | type == "string")' <<<"$retention" >/dev/null || fail "${label} retention read-back is not COMPLIANCE" 70
  until="$(jq -er '.Retention.RetainUntilDate' <<<"$retention")"
  node -e 'const [actual, required] = process.argv.slice(1).map(Date.parse); process.exit(Number.isFinite(actual) && Number.isFinite(required) && actual >= required ? 0 : 1)' "$until" "$RETAIN_UNTIL" || fail "${label} retention read-back is shorter than required" 70
}

recover_or_promote_federal() {
  local i=3 sidecar payload_present=0 manifest_present=0 payload_version="" manifest_version="" put
  sidecar="$TMP/${IDS[$i]}.manifest.json"
  jq -n --arg id "${IDS[$i]}" --arg payload "${PAYLOADS[$i]}" --arg sha "${SHAS[$i]}" --argjson bytes "${BYTES[$i]}" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$sidecar"

  if head_current_or_absent "${PAYLOADS[$i]}" payload; then payload_present=1; payload_version="$RESOLVED_VERSION"; fi
  if head_current_or_absent "${SIDECARS[$i]}" manifest; then manifest_present=1; manifest_version="$RESOLVED_VERSION"; fi
  if (( ! payload_present && manifest_present )); then
    fail "A manifest exists without its approved payload; recovery is ambiguous and no write was attempted" 73
  fi

  if (( payload_present )); then
    verify_existing_payload "${PAYLOADS[$i]}" "$payload_version" "${BYTES[$i]}" "${SHAS[$i]}"
  else
    print -- "Uploading absent approved federal payload by one direct S3 request; wait for the acknowledgement."
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Federal payload upload failed" 70
    payload_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "Federal payload upload acknowledgement has no concrete version" 70
    verify_existing_payload "${PAYLOADS[$i]}" "$payload_version" "${BYTES[$i]}" "${SHAS[$i]}"
  fi

  if (( manifest_present )); then
    verify_existing_manifest "${SIDECARS[$i]}" "$manifest_version" "$sidecar"
  else
    put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$sidecar" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Federal manifest upload failed" 70
    manifest_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' <<<"$put")" || fail "Federal manifest upload acknowledgement has no concrete version" 70
    verify_existing_manifest "${SIDECARS[$i]}" "$manifest_version" "$sidecar"
  fi

  ensure_compliance_retention "${PAYLOADS[$i]}" "$payload_version" payload
  ensure_compliance_retention "${SIDECARS[$i]}" "$manifest_version" manifest
  print -- "Federal promotion recovered or completed with exact version-specific payload, manifest, and retention read-backs."
}

if [[ "$MODE" == "run-federal" ]]; then
  recover_or_promote_federal
  exit 0
fi

for i in $PROMOTION_INDICES; do
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
  sidecar_version="$(jq -er '.VersionId' <<<"$sidecar_head")"; aws s3api put-object-retention --bucket "$BUCKET" --key "${SIDECARS[$i]}" --version-id "$sidecar_version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Sidecar COMPLIANCE retention application failed" 70
  sidecar_retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${SIDECARS[$i]}" --version-id "$sidecar_version" --region "$REGION" --output json)" || fail "Sidecar retention read-back failed" 70
  jq -e --arg d "$RETAIN_UNTIL" '.Retention.Mode == "COMPLIANCE" and (.Retention.RetainUntilDate | startswith($d[0:10]))' <<<"$sidecar_retention" >/dev/null || fail "Sidecar retention read-back mismatch" 70
  jq -e '.VersionId != null and (.ChecksumCRC64NVME // empty) != ""' <<<"$sidecar_head" >/dev/null || fail "Sidecar read-back incomplete" 70
done
print -- "Promotion completed. Preserve the Terminal output for the required redacted, version-specific audit."
