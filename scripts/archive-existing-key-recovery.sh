#!/bin/zsh
# Source from a narrowly scoped owner-local archive runner after it has set
# TMP, BUCKET, REGION, RETAIN_UNTIL and fail().  Existing fixed keys are never
# replaced: they are verified byte-for-byte or the operation stops.

WT_ARCHIVE_VERSION=""

wt_archive_head_current_or_absent() {
  local key label head_file error_file
  key="$1"; label="$2"; head_file="$TMP/existing-${label}.head.json"; error_file="$TMP/existing-${label}.head.stderr"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$head_file" 2>"$error_file"; then
    WT_ARCHIVE_VERSION="$(jq -er '.VersionId | select(type == "string" and length > 0 and . != "null")' <"$head_file")" || fail "Existing ${label} has no concrete version; recovery refused" 73
    return 0
  fi
  if grep -Eqi '(^|[^[:alnum:]])(404|not[[:space:]-]*found|nosuchkey|nosuchobject)([^[:alnum:]]|$)' "$error_file"; then WT_ARCHIVE_VERSION=""; return 1; fi
  fail "Could not resolve whether ${label} exists; recovery refused without a write" 73
}

wt_archive_verify_existing_payload() {
  local key version bytes sha label exact downloaded
  key="$1"; version="$2"; bytes="$3"; sha="$4"; label="$5"
  exact="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Could not read exact existing ${label}; recovery refused" 73
  jq -e --arg version "$version" --argjson bytes "$bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and (.ChecksumCRC64NVME | type == "string" and test("^[A-Za-z0-9+/]+={0,2}$"))' <<<"$exact" >/dev/null || fail "Existing ${label} lacks exact bytes or provider checksum; recovery refused" 73
  downloaded="$TMP/existing-${label}.payload"
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" "$downloaded" >/dev/null || fail "Could not download exact existing ${label}; recovery refused" 73
  [[ "$(shasum -a 256 "$downloaded" | awk '{print $1}')" == "$sha" ]] || fail "Existing ${label} bytes do not match the approved SHA-256; recovery refused" 73
}

wt_archive_verify_existing_manifest() {
  local key version expected label exact downloaded bytes
  key="$1"; version="$2"; expected="$3"; label="$4"
  bytes="$(stat -f %z "$expected")"; exact="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Could not read exact existing ${label}; recovery refused" 73
  jq -e --arg version "$version" --argjson bytes "$bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and (.ChecksumCRC64NVME | type == "string" and test("^[A-Za-z0-9+/]+={0,2}$"))' <<<"$exact" >/dev/null || fail "Existing ${label} metadata differs from the deterministic manifest; recovery refused" 73
  downloaded="$TMP/existing-${label}.manifest"
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" "$downloaded" >/dev/null || fail "Could not download exact existing ${label}; recovery refused" 73
  cmp -s "$expected" "$downloaded" || fail "Existing ${label} content differs from the deterministic manifest; recovery refused" 73
}

# The generic verifier remains byte-for-byte strict. A caller may supply a
# narrowly scoped comparator for one explicitly recorded historical manifest
# version; it cannot make an arbitrary different manifest acceptable.
wt_archive_verify_existing_manifest_with_legacy_comparator() {
  local key version expected label comparator exact downloaded bytes checksum
  key="$1"; version="$2"; expected="$3"; label="$4"; comparator="$5"
  bytes="$(stat -f %z "$expected")"; exact="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Could not read exact existing ${label}; recovery refused" 73
  jq -e --arg version "$version" '.VersionId == $version and .ChecksumType == "FULL_OBJECT" and (.ChecksumCRC64NVME | type == "string" and test("^[A-Za-z0-9+/]+={0,2}$"))' <<<"$exact" >/dev/null || fail "Existing ${label} lacks exact version or provider checksum; recovery refused" 73
  downloaded="$TMP/existing-${label}.manifest"
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" --checksum-mode ENABLED --region "$REGION" "$downloaded" >/dev/null || fail "Could not download exact existing ${label}; recovery refused" 73
  if [[ "$(stat -f %z "$downloaded")" == "$bytes" ]] && cmp -s "$expected" "$downloaded"; then return 0; fi
  checksum="$(jq -er '.ChecksumCRC64NVME' <<<"$exact")"
  node "$comparator" --compare "$key" "$version" "$downloaded" "$checksum" && return 0
  fail "Existing ${label} content differs from the deterministic manifest and is not an approved exact legacy version; recovery refused" 73
}

wt_archive_ensure_compliance_retention() {
  local key version label retention error_file mode until
  key="$1"; version="$2"; label="$3"; error_file="$TMP/existing-${label}.retention.stderr"
  if ! retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json 2>"$error_file")"; then
    grep -Eqi 'NoSuchObjectLockConfiguration|NoSuchRetentionConfiguration' "$error_file" || fail "Could not read existing ${label} retention; recovery refused" 73
    retention='{"Retention":{}}'
  fi
  mode="$(jq -r '.Retention.Mode // empty' <<<"$retention")"; until="$(jq -r '.Retention.RetainUntilDate // empty' <<<"$retention")"
  if [[ -z "$mode" && -z "$until" ]]; then
    aws s3api put-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Could not apply missing COMPLIANCE retention to ${label}" 70
  elif [[ "$mode" != "COMPLIANCE" ]] || ! node -e 'const [a,b]=process.argv.slice(1).map(Date.parse); process.exit(Number.isFinite(a)&&Number.isFinite(b)&&a>=b?0:1)' "$until" "$RETAIN_UNTIL"; then
    fail "Existing ${label} retention is not sufficient COMPLIANCE retention; recovery refused" 73
  fi
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json)" || fail "Could not read back ${label} retention" 70
  jq -e '.Retention.Mode == "COMPLIANCE" and (.Retention.RetainUntilDate | type == "string")' <<<"$retention" >/dev/null || fail "${label} retention read-back is not COMPLIANCE" 70
  until="$(jq -er '.Retention.RetainUntilDate' <<<"$retention")"; node -e 'const [a,b]=process.argv.slice(1).map(Date.parse); process.exit(Number.isFinite(a)&&Number.isFinite(b)&&a>=b?0:1)' "$until" "$RETAIN_UNTIL" || fail "${label} retention read-back is shorter than required" 70
}
