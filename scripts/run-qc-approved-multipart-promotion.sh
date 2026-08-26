#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

# Owner-local only.  The default is a no-AWS preparation check.  --run is
# intentionally unusable until the exact artifact and IAM approval is granted.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeQcArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
PART_SIZE=134217728
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/qc-immutable-promotion-preparation.json"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
STATE_ROOT="/private/tmp/witness-tree-qc-archive-promotion-state"
TMP=""

cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds identity mfa_serial totp; [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }
file_size() { stat -f %z "$1"; }
sha256_hex() { shasum -a 256 "$1" | awk '{print $1}'; }
sha256_b64() { print -n -- "$(sha256_hex "$1")" | xxd -r -p | base64 | tr -d '\n'; }
write_json() { local target="$1" value="$2" tmpfile="${1}.tmp.$$"; print -r -- "$value" > "$tmpfile" && chmod 600 "$tmpfile" && mv -f "$tmpfile" "$target"; }
state_update() { local state="$1" filter="$2"; shift 2; local temp="${state}.tmp.$$"; jq "$filter" "$@" "$state" > "$temp" && chmod 600 "$temp" && mv -f "$temp" "$state"; }

local_composite_checksum() {
  local id="$1" file="$2" bytes="$3" part_number=1 offset=0 part_bytes part_file digest_file
  part_file="$TMP/${id}.diagnostic-part"; digest_file="$TMP/${id}.diagnostic-digests.bin"; : > "$digest_file"; chmod 600 "$digest_file"
  while (( offset < bytes )); do
    part_bytes=$(( bytes - offset )); (( part_bytes > PART_SIZE )) && part_bytes=$PART_SIZE
    dd if="$file" of="$part_file" bs="$PART_SIZE" skip=$((part_number - 1)) count=1 2>/dev/null
    [[ "$(file_size "$part_file")" == "$part_bytes" ]] || fail "Local diagnostic part extraction mismatched the approved byte range; multipart state was preserved" 70
    print -n -- "$(sha256_hex "$part_file")" | xxd -r -p >> "$digest_file"
    (( part_number += 1, offset += part_bytes ))
  done
  rm -f "$part_file"
  print -- "$(openssl dgst -sha256 -binary "$digest_file" | base64 | tr -d '\n')-$((part_number - 1))"
}

verify_and_retain_payload() {
  local id="$1" payload="$2" bytes="$3" version="$4" composite="$5" adoption_state="${6:-}" payload_head retention retention_instant
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "$payload" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Payload version read-back failed" 70
  jq -e --arg version "$version" --argjson bytes "$bytes" --arg checksum "$composite" '.VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' <<<"$payload_head" >/dev/null || fail "Payload version read-back does not prove expected version, bytes, and composite checksum" 70
  [[ -z "$adoption_state" ]] || state_update "$adoption_state" '.payloadVersionId=$version | .compositeChecksumSha256=$checksum' --arg version "$version" --arg checksum "$composite"
  aws s3api put-object-retention --bucket "$BUCKET" --key "$payload" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Payload retention could not be applied; the verified version ID remains in local recovery state" 70
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$payload" --version-id "$version" --region "$REGION" --output json)" || fail "Payload retention read-back failed" 70
  jq -e '.Retention.Mode=="COMPLIANCE"' <<<"$retention" >/dev/null || fail "Payload retention read-back mismatch" 70
  retention_instant="$(jq -er '.Retention.RetainUntilDate | select(type=="string" and length>0)' <<<"$retention")" || fail "Payload retention read-back mismatch" 70
  node -e 'const [expected, actual] = process.argv.slice(1); if (!Number.isFinite(Date.parse(actual)) || Date.parse(actual) !== Date.parse(expected)) process.exit(1)' "$RETAIN_UNTIL" "$retention_instant" || fail "Payload retention read-back mismatch" 70
  print -- "Completed and retained $id at its exact provider version; retain local state for redacted independent read-back."
}

verify_reconciled_ecoforest() {
  local id="$1" payload="$2" bytes="$3" state="$4" version="$5" composite="$6" state_before payload_head retention retention_instant
  [[ "$id" == "qc-ecoforest-map-2026-08-14" ]] || fail "Reconciled fast path received an unauthorized artifact; no storage call was attempted" 70
  [[ "$version" != "" && "$version" != "null" && "$composite" =~ '^[A-Za-z0-9+/=]+-[0-9]+$' ]] || fail "Reconciled ecoforest state is incomplete or malformed; no storage write was attempted" 75
  state_before="$(<"$state")" || fail "Reconciled ecoforest private state could not be read; no storage write was attempted" 75
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "$payload" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json --no-cli-pager 2>"$TMP/${id}.reconciled-head.stderr")" || fail "Reconciled ecoforest exact-version read-back failed; no storage write was attempted" 75
  [[ "$(<"$state")" == "$state_before" ]] || fail "Reconciled ecoforest private state changed during exact-version read-back; no storage write was attempted" 75
  jq -e --arg version "$version" --argjson bytes "$bytes" --arg checksum "$composite" '.VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' <<<"$payload_head" >/dev/null || fail "Reconciled ecoforest exact-version bytes or composite checksum did not match; no storage write was attempted" 75
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "$payload" --version-id "$version" --region "$REGION" --output json --no-cli-pager 2>"$TMP/${id}.reconciled-retention.stderr")" || fail "Reconciled ecoforest retention read-back failed; no storage write was attempted" 75
  [[ "$(<"$state")" == "$state_before" ]] || fail "Reconciled ecoforest private state changed during retention read-back; no storage write was attempted" 75
  jq -e '.Retention.Mode=="COMPLIANCE"' <<<"$retention" >/dev/null || fail "Reconciled ecoforest retention was not COMPLIANCE; no storage write was attempted" 75
  retention_instant="$(jq -er '.Retention.RetainUntilDate | select(type=="string" and length>0)' <<<"$retention")" || fail "Reconciled ecoforest retention date was absent; no storage write was attempted" 75
  node -e 'const [expected, actual] = process.argv.slice(1); if (!Number.isFinite(Date.parse(actual)) || Date.parse(actual) !== Date.parse(expected)) process.exit(1)' "$RETAIN_UNTIL" "$retention_instant" || fail "Reconciled ecoforest retention date did not match; no storage write was attempted" 75
  print -- "Reconciled ecoforest payload verified; its path performed no multipart or storage write operation."
}

is_unambiguous_nosuchupload() {
  local error_file="$1" text
  text="$(sed '/^[[:space:]]*$/d' "$error_file")"
  [[ -n "$text" && "$text" != *$'\n'* ]] || return 1
  [[ "$text" == "An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist." || "$text" == "An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed." ]]
}

sanitized_list_parts_error_code() {
  node -e '
    const text = require("node:fs").readFileSync(process.argv[1], "utf8");
    const all = [...text.matchAll(/^An error occurred \(([^)\r\n]+)\)/gm)];
    const exact = [...text.matchAll(/^An error occurred \(([A-Za-z][A-Za-z0-9]{0,63})\) when calling the ListParts operation(?: \(reached max retries: [1-9][0-9]*\))?:/gm)];
    const validation = /^Parameter validation failed:/m.test(text);
    const allowed = new Set(["ExpiredToken", "AccessDenied", "ValidationError", "NoSuchUpload"]);
    if (all.length > 1 || (all.length === 1 && validation)) process.stdout.write("ambiguous");
    else if (all.length === 1 && exact.length === 1 && all[0][1] === exact[0][1] && allowed.has(exact[0][1])) process.stdout.write(exact[0][1]);
    else if (all.length === 0 && validation) process.stdout.write("ValidationError");
    else process.stdout.write("unavailable");
  ' "$1"
}

sanitized_list_parts_diagnostic_category() {
  node -e '
    const text = require("node:fs").readFileSync(process.argv[1], "utf8");
    const categories = [
      ["cli-usage", [/^usage: aws(?:\.cmd)? /m, /^Unknown options:/m, /argument --cli-error-format:/, /the following arguments are required:/]],
      ["credentials", [/Unable to locate credentials/, /Partial credentials found/, /Error when retrieving credentials/, /NoCredentialsError/]],
      ["timeout", [/Connect timeout on endpoint URL:/, /Read timeout on endpoint URL:/, /Operation timed out/]],
      ["network", [/Could not connect to the endpoint URL:/, /EndpointConnectionError/, /Name or service not known/, /SSL validation failed/]],
      ["process", [/credential_process/, /Broken pipe/, /process exited with a non-zero return code/]],
      ["provider-error-unparsed", [/^An error occurred \(/m, /^Error Code:/m]],
    ];
    process.stdout.write(categories.find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] ?? "unavailable");
  ' "$1"
}

sanitized_cli_exit_class() {
  case "$1" in 1|2|130|252|253|254|255) print -- "$1" ;; *) print -- "other" ;; esac
}

if [[ $# -eq 0 ]]; then node "$ROOT/scripts/prepare-qc-immutable-promotion.mjs"; exit 0; fi
[[ "${1:-}" == "--preflight" || "${1:-}" == "--run" ]] && [[ $# -eq 1 ]] || fail "Usage: $0 [--preflight|--run]" 64
for tool in node jq shasum xxd base64 dd stat; do need "$tool"; done
node "$ROOT/scripts/prepare-qc-immutable-promotion.mjs" >/dev/null

while IFS= read -r artifact; do
  relative="$(jq -r '.localPath' <<<"$artifact")"; file="$DATA_ROOT/$relative"; expected_bytes="$(jq -r '.byteLength' <<<"$artifact")"; expected_sha="$(jq -r '.sha256' <<<"$artifact")"
  [[ -f "$file" ]] || fail "Approved Québec artifact is missing at the controlled workspace-data path; no TOTP or AWS call was made" 65
  [[ "$(file_size "$file")" == "$expected_bytes" && "$(sha256_hex "$file")" == "$expected_sha" ]] || fail "Approved Québec artifact drifted; no TOTP or AWS call was made" 65
done < <(jq -c '.artifacts[]' "$PLAN")
print -- "PRECHECK passed: both approved Québec archives exist at the controlled workspace-data path with exact bytes and SHA-256; no TOTP or AWS call was made."
[[ "${1:-}" == "--preflight" ]] && exit 0

for tool in aws openssl; do need "$tool"; done
creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-qc-approved-promotion)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds

TMP="$(mktemp -d /private/tmp/witness-tree-qc-approved-promotion.XXXXXX)"; chmod 700 "$TMP"
mkdir -p "$STATE_ROOT"; chmod 700 "$STATE_ROOT"
node "$ROOT/scripts/prepare-qc-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null

promote_one() {
  local artifact="$1" id relative file bytes sha payload sidecar sidecar_file state state_dir expected_state sidecar_sha sidecar_b64 sidecar_put sidecar_version sidecar_head upload_id list list_error list_error_code list_error_category list_status list_exit_class no_such_upload=false start_new_upload=false part_number offset part_bytes part_file part_b64 part_result parts_file composite_file composite composite_b64 complete version latest_head exact_head observed
  id="$(jq -r '.id' <<<"$artifact")"; relative="$(jq -r '.localPath' <<<"$artifact")"; file="$DATA_ROOT/$relative"; bytes="$(jq -r '.byteLength' <<<"$artifact")"; sha="$(jq -r '.sha256' <<<"$artifact")"; payload="$(jq -r '.payloadKey' <<<"$artifact")"; sidecar="$(jq -r '.manifestKey' <<<"$artifact")"; sidecar_file="$TMP/${id}.manifest.json"
  state_dir="$STATE_ROOT/${id}-${sha}"; state="$state_dir/state.json"; mkdir -p "$state_dir"; chmod 700 "$state_dir"
  expected_state="$(jq -n --arg id "$id" --arg payload "$payload" --arg sidecar "$sidecar" --arg sha "$sha" --argjson bytes "$bytes" --argjson partSize "$PART_SIZE" '{artifactId:$id,payloadKey:$payload,manifestKey:$sidecar,sha256:$sha,byteLength:$bytes,partSizeBytes:$partSize,initiation:"not-started",uploadId:null,payloadVersionId:null,compositeChecksumSha256:null,sidecarVersionId:null}')"
  if [[ ! -f "$state" ]]; then write_json "$state" "$expected_state"; else jq -e --argjson expected "$expected_state" 'del(.initiation,.uploadId,.payloadVersionId,.compositeChecksumSha256,.sidecarVersionId) == ($expected | del(.initiation,.uploadId,.payloadVersionId,.compositeChecksumSha256,.sidecarVersionId))' "$state" >/dev/null || fail "Existing multipart state does not match this approved artifact; no new upload was started" 70; fi

  sidecar_sha="$(sha256_hex "$sidecar_file")"; sidecar_b64="$(sha256_b64 "$sidecar_file")"; sidecar_version="$(jq -r '.sidecarVersionId // empty' "$state")"
  upload_id="$(jq -r '.uploadId // empty' "$state")"
  version="$(jq -r '.payloadVersionId // empty' "$state")"; composite="$(jq -r '.compositeChecksumSha256 // empty' "$state")"
  if [[ "$id" == "qc-ecoforest-map-2026-08-14" && ( -n "$version" || -n "$composite" ) ]]; then
    [[ -n "$version" && -n "$composite" ]] || fail "Reconciled ecoforest private state is partial; no ListParts or storage write was attempted" 75
    verify_reconciled_ecoforest "$id" "$payload" "$bytes" "$state" "$version" "$composite"
    return 0
  fi
  if [[ -n "$upload_id" ]]; then
    [[ "$(jq -r '.initiation' "$state")" == "accepted" && -n "$sidecar_version" ]] || fail "Saved multipart state lacks its exact accepted sidecar version; state was preserved and no upload or overwrite was attempted" 75
    list_error="$TMP/${id}.list-parts.stderr"
    if list="$(aws s3api list-parts --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --region "$REGION" --output json --cli-error-format legacy 2>"$list_error")"; then :; else
      list_status=$?
      if ! is_unambiguous_nosuchupload "$list_error"; then
        list_error_code="$(sanitized_list_parts_error_code "$list_error")"
        list_error_category="$(sanitized_list_parts_diagnostic_category "$list_error")"
        list_exit_class="$(sanitized_cli_exit_class "$list_status")"
        fail "Cannot unambiguously classify the approved multipart state; stage=ListParts; awsErrorCode=$list_error_code; diagnosticCategory=$list_error_category; cliExit=$list_exit_class; no sidecar or payload write was attempted" 70
      fi
      no_such_upload=true
    fi
  else
    [[ "$(jq -r '.initiation' "$state")" == "not-started" ]] || fail "Multipart initiation is indeterminate; preserve this state directory and obtain a read-only recovery audit before any new upload" 70
    # A sidecar put is allowed only when no accepted exact version exists. An
    # interrupted not-started state reuses its saved version by exact head.
    if [[ -z "$sidecar_version" ]]; then
      print -- "Uploading deterministic sidecar for $id."
      sidecar_put="$(aws s3api put-object --bucket "$BUCKET" --key "$sidecar" --body "$sidecar_file" --checksum-algorithm SHA256 --checksum-sha256 "$sidecar_b64" --region "$REGION" --output json)" || fail "Sidecar upload failed" 70
      sidecar_version="$(jq -r '.VersionId // empty' <<<"$sidecar_put")"; [[ -n "$sidecar_version" ]] || fail "Sidecar upload acknowledgement lacks a version ID" 70
      state_update "$state" '.sidecarVersionId=$version' --arg version "$sidecar_version"
    fi
    start_new_upload=true
  fi

  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "$sidecar" --version-id "$sidecar_version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Sidecar read-back failed" 70
  jq -e --arg version "$sidecar_version" --arg checksum "$sidecar_b64" --argjson bytes "$(file_size "$sidecar_file")" '.VersionId==$version and .ContentLength==$bytes and .ChecksumSHA256==$checksum' <<<"$sidecar_head" >/dev/null || fail "Sidecar exact-version read-back mismatch" 70

  if [[ "$start_new_upload" == true ]]; then
    state_update "$state" '.initiation="requested"'
    print -- "Initiating sequential multipart upload for $id."
    local initiated; initiated="$(aws s3api create-multipart-upload --bucket "$BUCKET" --key "$payload" --checksum-algorithm SHA256 --region "$REGION" --output json)" || fail "Multipart initiation failed; state records that no retry may start a second upload" 70
    upload_id="$(jq -r '.UploadId // empty' <<<"$initiated")"; [[ -n "$upload_id" ]] || fail "Multipart initiation acknowledgement lacks an upload ID; state prevents a duplicate upload" 70
    state_update "$state" '.initiation="accepted" | .uploadId=$uploadId' --arg uploadId "$upload_id"
    list_error="$TMP/${id}.list-parts.stderr"
    if list="$(aws s3api list-parts --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --region "$REGION" --output json --cli-error-format legacy 2>"$list_error")"; then :; else
      list_status=$?
      list_error_code="$(sanitized_list_parts_error_code "$list_error")"
      list_error_category="$(sanitized_list_parts_diagnostic_category "$list_error")"
      list_exit_class="$(sanitized_cli_exit_class "$list_status")"
      fail "Cannot read newly accepted multipart state; stage=ListParts; awsErrorCode=$list_error_code; diagnosticCategory=$list_error_category; cliExit=$list_exit_class; no part was sent" 70
    fi
  fi

  if [[ "$no_such_upload" == true ]]; then
    print -- "Saved multipart upload is no longer active; checking only the exact payload key for a completed matching object."
    composite="$(local_composite_checksum "$id" "$file" "$bytes")"
    if ! latest_head="$(aws s3api head-object --bucket "$BUCKET" --key "$payload" --checksum-mode ENABLED --region "$REGION" --output json 2>"$TMP/${id}.latest-head.stderr")"; then
      fail "Saved multipart upload is absent and no exact completed payload can be proved; state was preserved and no new upload was started" 75
    fi
    version="$(jq -r '.VersionId // empty' <<<"$latest_head")"
    jq -e --arg version "$version" --argjson bytes "$bytes" --arg checksum "$composite" '$version!="" and .VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' <<<"$latest_head" >/dev/null || fail "Saved multipart upload is absent and the current exact-key object does not match the approved payload; state was preserved and no new upload was started" 75
    exact_head="$(aws s3api head-object --bucket "$BUCKET" --key "$payload" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json)" || fail "Completed candidate could not be read back at its exact version; state was preserved and no new upload was started" 75
    jq -e --arg version "$version" --argjson bytes "$bytes" --arg checksum "$composite" '.VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' <<<"$exact_head" >/dev/null || fail "Exact-version completed candidate does not match the approved payload; state was preserved and no new upload was started" 75
    verify_and_retain_payload "$id" "$payload" "$bytes" "$version" "$composite" "$state"
    print -- "Recovered completed payload evidence after NoSuchUpload without creating, uploading, completing, or overwriting an object."
    return 0
  fi
  composite_file="$state_dir/part-digests.bin"; : > "$composite_file"; chmod 600 "$composite_file"
  part_number=1; offset=0
  while (( offset < bytes )); do
    part_bytes=$(( bytes - offset )); (( part_bytes > PART_SIZE )) && part_bytes=$PART_SIZE
    part_file="$TMP/${id}.part"; dd if="$file" of="$part_file" bs="$PART_SIZE" skip=$((part_number - 1)) count=1 2>/dev/null
    [[ "$(file_size "$part_file")" == "$part_bytes" ]] || fail "Local multipart part extraction mismatched the approved byte range" 70
    part_b64="$(sha256_b64 "$part_file")"; print -n -- "$(sha256_hex "$part_file")" | xxd -r -p >> "$composite_file"
    observed="$(jq -c --argjson n "$part_number" '.Parts[]? | select(.PartNumber==$n)' <<<"$list")"
    if [[ -n "$observed" ]]; then
      jq -e --arg checksum "$part_b64" --argjson size "$part_bytes" '.Size==$size and .ChecksumSHA256==$checksum and (.ETag // "") != ""' <<<"$observed" >/dev/null || fail "Previously uploaded part does not match the approved local bytes; no completion was attempted" 70
      print -- "Resuming verified part $part_number."
    else
      print -- "Uploading $id part $part_number (offset $offset, $part_bytes bytes)."
      part_result="$(aws s3api upload-part --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --part-number "$part_number" --body "$part_file" --checksum-algorithm SHA256 --checksum-sha256 "$part_b64" --region "$REGION" --cli-read-timeout 0 --output json)" || fail "Multipart part upload failed; rerun resumes only verified parts" 70
      jq -e --arg checksum "$part_b64" '(.ETag // "") != "" and .ChecksumSHA256==$checksum' <<<"$part_result" >/dev/null || fail "Multipart part acknowledgement lacks its matching checksum; no completion was attempted" 70
      list="$(aws s3api list-parts --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --region "$REGION" --output json)" || fail "Part was sent but cannot be verified; rerun must resume from provider state" 70
    fi
    rm -f "$part_file"; (( part_number += 1, offset += part_bytes ))
  done
  composite_b64="$(openssl dgst -sha256 -binary "$composite_file" | base64 | tr -d '\n')"; composite="${composite_b64}-$((part_number - 1))"
  version="$(jq -r '.payloadVersionId // empty' "$state")"
  if [[ -z "$version" ]]; then
    list="$(aws s3api list-parts --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --region "$REGION" --output json)" || fail "Cannot obtain the final provider part list; no completion was attempted" 70
    parts_file="$TMP/${id}.complete.json"
    jq --argjson count "$((part_number - 1))" --arg checksum "$composite" 'if ((.Parts | length) != $count) then error("missing provider parts") else {Parts: [.Parts | sort_by(.PartNumber)[] | {PartNumber, ETag, ChecksumSHA256}]} end' <<<"$list" > "$parts_file" || fail "Provider part list is incomplete; no completion was attempted" 70
    print -- "Completing $id only after all $((part_number - 1)) provider-verified parts match local SHA-256 values."
    complete="$(aws s3api complete-multipart-upload --bucket "$BUCKET" --key "$payload" --upload-id "$upload_id" --multipart-upload "file://$parts_file" --region "$REGION" --output json)" || fail "Multipart completion failed; rerun preserves the upload state" 70
    version="$(jq -r '.VersionId // empty' <<<"$complete")"; jq -e --arg checksum "$composite" '.ChecksumSHA256==$checksum' <<<"$complete" >/dev/null || fail "Multipart completion acknowledgement lacks the locally recomputed composite checksum" 70
    [[ -n "$version" ]] || fail "Multipart completion acknowledgement lacks a version ID" 70
    state_update "$state" '.payloadVersionId=$version | .compositeChecksumSha256=$checksum' --arg version "$version" --arg checksum "$composite"
  fi
  composite="$(jq -r '.compositeChecksumSha256' "$state")"
  verify_and_retain_payload "$id" "$payload" "$bytes" "$version" "$composite"
}

while IFS= read -r artifact; do promote_one "$artifact"; done < <(jq -c '.artifacts[]' "$PLAN")
print -- "Promotion completed; capture redacted independent version, byte-length, provider-checksum, and retention read-backs before any archival admission."
