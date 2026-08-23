#!/bin/zsh
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeFederalElectoralPromotionUploader"
ACCOUNT="286853118812"
OPERATOR_ARN="arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
ROLE_IDENTITY_ARN="arn:aws:sts::${ACCOUNT}:assumed-role/${ROLE}/witness-tree-federal-electoral-promotion"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="${0:A:h:h}"
PLAN="${FEDERAL_PLAN:-$ROOT/data/elections-canada-fed-2025-promotion-preparation.json}"
APPROVAL="${FEDERAL_APPROVAL:-$ROOT/data/phase1-phase3-owner-approvals-2026-08-21.json}"
IAM_DESIRED="${FEDERAL_IAM_DESIRED:-$ROOT/data/federal-electoral-promotion-iam-desired-state.json}"
IAM_ATTESTATION="${FEDERAL_IAM_ATTESTATION:-$ROOT/data/federal-electoral-promotion-iam-live-attestation.json}"
PRIVATE_OUTPUT="${FEDERAL_PRIVATE_OUTPUT:-/private/tmp/witness-tree-federal-electoral-promotion-attestation.json}"
PUBLIC_OUTPUT="${FEDERAL_PUBLIC_OUTPUT:-/private/tmp/witness-tree-federal-electoral-promotion-attestation-redacted.json}"
CAPTURE_DIR=""
REMOTE_MUTATION=0

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required; no remote mutation was attempted" 69; }
sha256_hex() { shasum -a 256 "$1" | awk '{print $1}'; }
file_size() { stat -f %z "$1"; }

remove_owned_capture() {
  local name
  [[ "$CAPTURE_DIR" =~ '^/private/tmp/witness-tree-federal-electoral-promotion-capture\.[A-Za-z0-9]{6}$' ]] || return 1
  [[ -d "$CAPTURE_DIR" && ! -L "$CAPTURE_DIR" && "$(stat -f %u "$CAPTURE_DIR")" == "$(id -u)" ]] || return 1
  for name in \
    mfa-session.json mfa-session.stderr operator-identity.json operator-identity.stderr assume-role.json assume-role.stderr role-identity.json role-identity.stderr \
    payload-stable.bin payload-stable.json manifest-stable.json manifest-local.json payload-versions-before.json payload-versions-before.stderr payload-absence.json payload-absence.stderr \
    payload-put.json payload-put.stderr payload-head.json payload-head.stderr payload-retention-put.json payload-retention-put.stderr payload-retention.json payload-retention.stderr payload-versions-after.json payload-versions-after.stderr \
    manifest-versions-before.json manifest-versions-before.stderr manifest-absence.json manifest-absence.stderr manifest-put.json manifest-put.stderr manifest-head.json manifest-head.stderr manifest-versions-after.json manifest-versions-after.stderr \
    attestation-input.json; do
    [[ ! -L "$CAPTURE_DIR/$name" ]] || return 1
    [[ ! -e "$CAPTURE_DIR/$name" ]] || rm -f -- "$CAPTURE_DIR/$name" || return 1
  done
  rmdir -- "$CAPTURE_DIR"
}

cleanup() {
  local exit_status=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds identity role_identity totp mfa_serial
  if [[ -n "$CAPTURE_DIR" && -d "$CAPTURE_DIR" ]]; then
    if (( exit_status == 0 || REMOTE_MUTATION == 0 )); then
      remove_owned_capture || { print -u2 -- "Stopped: owner-only federal capture cleanup could not be proved; inspect local capture state."; exit_status=70; }
    else
      print -u2 -- "Stopped after a primary mutation; owner-only federal recovery capture was preserved.";
    fi
  fi
  exit "$exit_status"
}
trap cleanup EXIT

[[ $# -eq 1 && ( "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 --preflight|--run" 64
for tool in node jq shasum stat awk mktemp basename date; do need "$tool"; done

# The static plan, approval, IAM desired-state, and primary-only recovery gates
# are authoritative and must pass before an MFA prompt or any AWS call.
node "$ROOT/scripts/check-federal-electoral-promotion-gates.mjs" --plan "$PLAN" --approval "$APPROVAL" --iam "$IAM_DESIRED" >/dev/null || fail "Federal plan, owner approval, IAM desired-state, or primary-only recovery gate failed; no TOTP or AWS call was made" 75

SOURCE_ID="$(jq -er '.snapshot.sourceId' "$PLAN")" || fail "Federal plan source identity is unavailable; no TOTP or AWS call was made" 65
SOURCE_LOCAL_PATH="$(jq -er '.snapshot.localPath' "$PLAN")" || fail "Federal plan local descriptor path is unavailable; no TOTP or AWS call was made" 65
BYTES="$(jq -er '.snapshot.byteLength' "$PLAN")" || fail "Federal plan byte length is unavailable; no TOTP or AWS call was made" 65
SHA256="$(jq -er '.snapshot.sha256' "$PLAN")" || fail "Federal plan SHA-256 is unavailable; no TOTP or AWS call was made" 65
PAYLOAD_KEY="$(jq -er '.deterministicRemoteNames.payloadKey' "$PLAN")" || fail "Federal plan payload key is unavailable; no TOTP or AWS call was made" 65
MANIFEST_KEY="$(jq -er '.deterministicRemoteNames.manifestKey' "$PLAN")" || fail "Federal plan manifest key is unavailable; no TOTP or AWS call was made" 65
[[ "$SOURCE_ID" == "elections-canada-federal-electoral-districts-45th-general-election-2025-shp" && "$BYTES" == "10301648" && "$SHA256" == "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93" ]] || fail "Federal plan identity is not the exact approved artifact; no TOTP or AWS call was made" 65
[[ "$SOURCE_LOCAL_PATH" == ../Witness_Tree-data/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip ]] || fail "Federal plan local path is outside the exact approved artifact; no TOTP or AWS call was made" 65
DATA_ROOT="${FEDERAL_DATA_ROOT:-$ROOT/../Witness_Tree-data}"
[[ "$DATA_ROOT" == /* && "$(basename "$DATA_ROOT")" == "Witness_Tree-data" && -d "$DATA_ROOT" && ! -L "$DATA_ROOT" ]] || fail "Federal data root is not the exact controlled Witness_Tree-data directory; no TOTP or AWS call was made" 65
LOCAL_SUFFIX="${SOURCE_LOCAL_PATH#../Witness_Tree-data/}"
[[ "$LOCAL_SUFFIX" != "$SOURCE_LOCAL_PATH" && "$LOCAL_SUFFIX" != ../* ]] || fail "Federal plan local path is not bound to the controlled data root; no TOTP or AWS call was made" 65
PAYLOAD="$DATA_ROOT/$LOCAL_SUFFIX"
[[ "$PAYLOAD_KEY" == raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/*/payload/federalelectoraldistricts_2025_shp.zip ]] || fail "Federal payload key is outside the exact plan binding; no TOTP or AWS call was made" 65
[[ "$MANIFEST_KEY" == raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/*/manifest.json ]] || fail "Federal manifest key is outside the exact plan binding; no TOTP or AWS call was made" 65
[[ -f "$PAYLOAD" && ! -L "$PAYLOAD" ]] || fail "Approved federal payload is missing or aliased; no TOTP or AWS call was made" 65
[[ "$(stat -f %z "$PAYLOAD")" == "$BYTES" ]] || fail "Approved federal byte length drifted; no TOTP or AWS call was made" 65
[[ "$(sha256_hex "$PAYLOAD")" == "$SHA256" ]] || fail "Approved federal source SHA-256 drifted; no TOTP or AWS call was made" 65
print -- "Federal PRECHECK passed: exact plan-bound source identity; no TOTP or AWS call was made."
[[ "$1" == "--preflight" ]] && exit 0

for tool in aws; do need "$tool"; done
for output in "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT"; do [[ ! -e "$output" && ! -L "$output" ]] || fail "Attestation output already exists; inspect output state before any AWS call" 73; done
# The live IAM attestation is a separate owner/admin readback. It is required
# before credentials are requested and is never inferred from the plan.
node "$ROOT/scripts/check-federal-electoral-promotion-gates.mjs" --plan "$PLAN" --approval "$APPROVAL" --iam "$IAM_DESIRED" --live-iam "$IAM_ATTESTATION" --require-live >/dev/null || fail "Federal live IAM policy/actions/resources gate failed; no TOTP or AWS call was made" 75
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64

read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or storage call was made" 69
CAPTURE_DIR="$(mktemp -d /private/tmp/witness-tree-federal-electoral-promotion-capture.XXXXXX)" || fail "Owner-only capture directory could not be created" 69
chmod 700 "$CAPTURE_DIR"

aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json >"$CAPTURE_DIR/mfa-session.json" 2>"$CAPTURE_DIR/mfa-session.stderr" || fail "MFA session failed; no S3 write was attempted" 77
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$CAPTURE_DIR/mfa-session.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$CAPTURE_DIR/mfa-session.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$CAPTURE_DIR/mfa-session.json")"
aws sts get-caller-identity --output json >"$CAPTURE_DIR/operator-identity.json" 2>"$CAPTURE_DIR/operator-identity.stderr" || fail "MFA operator identity could not be read; no S3 write was attempted" 77
jq -e --arg account "$ACCOUNT" --arg arn "$OPERATOR_ARN" '.Account == $account and .Arn == $arn' "$CAPTURE_DIR/operator-identity.json" >/dev/null || fail "MFA session is not the exact approved operator; no S3 write was attempted" 77
aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name witness-tree-federal-electoral-promotion --duration-seconds 3600 --output json >"$CAPTURE_DIR/assume-role.json" 2>"$CAPTURE_DIR/assume-role.stderr" || fail "Federal promotion role assumption failed; no S3 write was attempted" 77
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$CAPTURE_DIR/assume-role.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$CAPTURE_DIR/assume-role.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$CAPTURE_DIR/assume-role.json")"
aws sts get-caller-identity --output json >"$CAPTURE_DIR/role-identity.json" 2>"$CAPTURE_DIR/role-identity.stderr" || fail "Assumed federal role identity could not be read; no S3 write was attempted" 77
jq -e --arg account "$ACCOUNT" --arg arn "$ROLE_IDENTITY_ARN" '.Account == $account and .Arn == $arn' "$CAPTURE_DIR/role-identity.json" >/dev/null || fail "Assumed session is not the exact approved federal role; no S3 write was attempted" 77

stable_payload="$(node "$ROOT/scripts/federal-electoral-stable-file.mjs" --copy --source "$PAYLOAD" --destination "$CAPTURE_DIR/payload-stable.bin" --bytes "$BYTES" --sha256 "$SHA256")" || fail "Descriptor-bound federal source copy failed; no S3 write was attempted" 70
print -r -- "$stable_payload" >"$CAPTURE_DIR/payload-stable.json"
payload_checksum="$(jq -er '.checksumSha256' "$CAPTURE_DIR/payload-stable.json")" || fail "Local federal provider checksum could not be computed; no S3 write was attempted" 70
[[ "$(jq -er '.sha256' "$CAPTURE_DIR/payload-stable.json")" == "$SHA256" && "$(jq -er '.byteLength' "$CAPTURE_DIR/payload-stable.json")" == "$BYTES" ]] || fail "Descriptor-bound federal source metadata drifted; no S3 write was attempted" 70
manifest_value="$(jq -cn --arg id "$SOURCE_ID" --arg payload "$PAYLOAD_KEY" --arg sha "$SHA256" --arg checksum "$payload_checksum" --argjson bytes "$BYTES" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,checksumAlgorithm:"SHA256",checksumSha256:$checksum,notice:"Approved raw primary-only payload; no recovery, transformation, ingestion, release, or production admission."}')"
manifest_result="$(node "$ROOT/scripts/federal-electoral-stable-file.mjs" --manifest --destination "$CAPTURE_DIR/manifest-stable.json" --value "$manifest_value")" || fail "Descriptor-bound federal manifest preparation failed; no S3 write was attempted" 70
print -r -- "$manifest_result" >"$CAPTURE_DIR/manifest-local.json"
manifest_checksum="$(jq -er '.checksumSha256' "$CAPTURE_DIR/manifest-local.json")" || fail "Local federal manifest provider checksum could not be computed; no S3 write was attempted" 70
manifest_bytes="$(jq -er '.byteLength' "$CAPTURE_DIR/manifest-local.json")" || fail "Local federal manifest byte length could not be computed; no S3 write was attempted" 70

prove_absent() {
  local label key list_json list_err head_json head_err classification
  label="$1"; key="$2"; list_json="$CAPTURE_DIR/${label}-versions-before.json"; list_err="$CAPTURE_DIR/${label}-versions-before.stderr"; head_json="$CAPTURE_DIR/${label}-absence.json"; head_err="$CAPTURE_DIR/${label}-absence.stderr"
  aws s3api list-object-versions --bucket "$BUCKET" --prefix "$key" --max-keys 1000 --region "$REGION" --output json >"$list_json" 2>"$list_err" || fail "Federal destination version list could not be read; no write was attempted" 70
  jq -e --arg key "$key" '(.IsTruncated == false) and ((.Versions // []) | length == 0) and ((.DeleteMarkers // []) | length == 0) and (([.Versions[]?.Key] + [.DeleteMarkers[]?.Key]) | all(. == $key))' "$list_json" >/dev/null || fail "Federal destination has a version, delete marker, unrelated prefix result, or truncated version list; no write was attempted" 73
  if aws s3api head-object --bucket "$BUCKET" --key "$key" --if-none-match '*' --checksum-mode ENABLED --region "$REGION" --output json >"$head_json" 2>"$head_err"; then
    fail "Federal destination key is already occupied; no write was attempted" 73
  fi
  classification="$(node "$ROOT/scripts/classify-federal-head-absence.mjs" "$head_err")" || classification="ambiguous"
  [[ "$classification" == "absent" ]] || fail "Federal destination absence was not one exact 404/NoSuchKey HeadObject error; no write was attempted" 70
}

prove_absent payload "$PAYLOAD_KEY"
prove_absent manifest "$MANIFEST_KEY"

put_exact() {
  local label key body checksum put_json put_err version crc
  label="$1"; key="$2"; body="$3"; checksum="$4"; put_json="$CAPTURE_DIR/${label}-put.json"; put_err="$CAPTURE_DIR/${label}-put.stderr"
  aws s3api put-object --bucket "$BUCKET" --key "$key" --body "$body" --if-none-match '*' --checksum-algorithm SHA256 --checksum-sha256 "$checksum" --metadata "sha256=$([ "$label" = payload ] && print -n -- "$SHA256" || sha256_hex "$body")" --region "$REGION" --cli-read-timeout 0 --output json >"$put_json" 2>"$put_err" || fail "Federal ${label} conditional upload failed or is uncertain; preserve owner-only capture" 70
  version="$(jq -er '.VersionId' "$put_json")" || fail "Federal ${label} upload acknowledgement lacks a version ID; preserve owner-only capture" 70
  crc="$(jq -er '.ChecksumSHA256' "$put_json")" || fail "Federal ${label} upload acknowledgement lacks the provider checksum; preserve owner-only capture" 70
  [[ "$crc" == "$checksum" ]] || fail "Federal ${label} provider checksum differs from the locally computed checksum; preserve owner-only capture" 70
  print -r -- "$version"
}

REMOTE_MUTATION=1
payload_version="$(put_exact payload "$PAYLOAD_KEY" "$CAPTURE_DIR/payload-stable.bin" "$payload_checksum")"
aws s3api head-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --checksum-mode ENABLED --region "$REGION" --output json >"$CAPTURE_DIR/payload-head.json" 2>"$CAPTURE_DIR/payload-head.stderr" || fail "Federal payload exact-version read-back failed; preserve owner-only capture" 70
payload_head_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -e --arg version "$payload_version" --arg checksum "$payload_checksum" --argjson bytes "$BYTES" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumSHA256 == $checksum' "$CAPTURE_DIR/payload-head.json" >/dev/null || fail "Federal payload exact-version bytes, type, or checksum mismatch; preserve owner-only capture" 70
aws s3api put-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" --output json >"$CAPTURE_DIR/payload-retention-put.json" 2>"$CAPTURE_DIR/payload-retention-put.stderr" || fail "Federal payload COMPLIANCE retention application failed; preserve owner-only capture" 70
aws s3api get-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --region "$REGION" --output json >"$CAPTURE_DIR/payload-retention.json" 2>"$CAPTURE_DIR/payload-retention.stderr" || fail "Federal payload retention read-back failed; preserve owner-only capture" 70
retention_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -e --arg until "$RETAIN_UNTIL" '.Retention.Mode == "COMPLIANCE" and .Retention.RetainUntilDate == $until' "$CAPTURE_DIR/payload-retention.json" >/dev/null || fail "Federal payload retention read-back mismatch; preserve owner-only capture" 70
aws s3api list-object-versions --bucket "$BUCKET" --prefix "$PAYLOAD_KEY" --max-keys 1000 --region "$REGION" --output json >"$CAPTURE_DIR/payload-versions-after.json" 2>"$CAPTURE_DIR/payload-versions-after.stderr" || fail "Federal payload post-write version list failed; preserve owner-only capture" 70
jq -e --arg key "$PAYLOAD_KEY" --arg version "$payload_version" '(.IsTruncated == false) and ((.DeleteMarkers // []) | length == 0) and ((.Versions // []) | length == 1) and .Versions[0].Key == $key and .Versions[0].VersionId == $version' "$CAPTURE_DIR/payload-versions-after.json" >/dev/null || fail "Federal payload post-write version list is not exactly one version with no delete marker; preserve owner-only capture" 70

manifest_version="$(put_exact manifest "$MANIFEST_KEY" "$CAPTURE_DIR/manifest-stable.json" "$manifest_checksum")"
aws s3api head-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --version-id "$manifest_version" --checksum-mode ENABLED --region "$REGION" --output json >"$CAPTURE_DIR/manifest-head.json" 2>"$CAPTURE_DIR/manifest-head.stderr" || fail "Federal manifest exact-version read-back failed; preserve owner-only capture" 70
manifest_head_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -e --arg version "$manifest_version" --arg checksum "$manifest_checksum" --argjson bytes "$manifest_bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumSHA256 == $checksum' "$CAPTURE_DIR/manifest-head.json" >/dev/null || fail "Federal manifest exact-version bytes, type, or checksum mismatch; preserve owner-only capture" 70
aws s3api list-object-versions --bucket "$BUCKET" --prefix "$MANIFEST_KEY" --max-keys 1000 --region "$REGION" --output json >"$CAPTURE_DIR/manifest-versions-after.json" 2>"$CAPTURE_DIR/manifest-versions-after.stderr" || fail "Federal manifest post-write version list failed; preserve owner-only capture" 70
jq -e --arg key "$MANIFEST_KEY" --arg version "$manifest_version" '(.IsTruncated == false) and ((.DeleteMarkers // []) | length == 0) and ((.Versions // []) | length == 1) and .Versions[0].Key == $key and .Versions[0].VersionId == $version' "$CAPTURE_DIR/manifest-versions-after.json" >/dev/null || fail "Federal manifest post-write version list is not exactly one version with no delete marker; preserve owner-only capture" 70

[[ "$(sha256_hex "$CAPTURE_DIR/payload-stable.bin")" == "$SHA256" ]] || fail "Stable federal payload changed during upload; preserve owner-only capture" 70
created_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
cat_raw_names='["mfa-session.json","mfa-session.stderr","operator-identity.json","operator-identity.stderr","assume-role.json","assume-role.stderr","role-identity.json","role-identity.stderr","payload-stable.bin","payload-stable.json","manifest-stable.json","manifest-local.json","payload-versions-before.json","payload-versions-before.stderr","payload-absence.json","payload-absence.stderr","payload-put.json","payload-put.stderr","payload-head.json","payload-head.stderr","payload-retention-put.json","payload-retention-put.stderr","payload-retention.json","payload-retention.stderr","payload-versions-after.json","payload-versions-after.stderr","manifest-versions-before.json","manifest-versions-before.stderr","manifest-absence.json","manifest-absence.stderr","manifest-put.json","manifest-put.stderr","manifest-head.json","manifest-head.stderr","manifest-versions-after.json","manifest-versions-after.stderr"]'
jq -n --arg createdAt "$created_at" --arg operatorAccount "$(jq -er '.Account' "$CAPTURE_DIR/operator-identity.json")" --arg operatorArn "$(jq -er '.Arn' "$CAPTURE_DIR/operator-identity.json")" --arg roleAccount "$(jq -er '.Account' "$CAPTURE_DIR/role-identity.json")" --arg roleArn "$(jq -er '.Arn' "$CAPTURE_DIR/role-identity.json")" --arg roleName "$ROLE_ARN" --arg sourceId "$SOURCE_ID" --argjson bytes "$BYTES" --arg localSha "$SHA256" --arg payloadKey "$PAYLOAD_KEY" --arg payloadVersion "$payload_version" --arg payloadChecksum "$payload_checksum" --argjson payloadHeadAt "$(jq -n --arg value "$payload_head_at" '$value')" --arg manifestKey "$MANIFEST_KEY" --arg manifestVersion "$manifest_version" --arg manifestChecksum "$manifest_checksum" --argjson manifestBytes "$manifest_bytes" --arg manifestHeadAt "$manifest_head_at" --arg retentionAt "$retention_at" --arg retainUntil "$RETAIN_UNTIL" --argjson localDescriptor "$(cat "$CAPTURE_DIR/payload-stable.json")" --argjson rawResponseNames "$cat_raw_names" '{createdAt:$createdAt,operator:{Account:$operatorAccount,Arn:$operatorArn},assumedRole:{Account:$roleAccount,Arn:$roleArn,roleArn:$roleName},artifact:{sourceId:$sourceId,byteLength:$bytes,localSha256:$localSha,localDescriptor:{stableCopy:true,sourceDevice:$localDescriptor.sourceDevice,sourceInode:$localDescriptor.sourceInode,byteLength:$localDescriptor.byteLength,sha256:$localDescriptor.sha256,checksum:{algorithm:$localDescriptor.checksumAlgorithm,type:$localDescriptor.checksumType,providerValue:$localDescriptor.checksumSha256,localValue:$localDescriptor.checksumSha256}},payload:{key:$payloadKey,versionId:$payloadVersion,contentLength:$bytes,checksum:{algorithm:"SHA256",type:"FULL_OBJECT",providerValue:$payloadChecksum,localValue:$payloadChecksum},headObjectReadAt:$payloadHeadAt,headResponseSha256:"pending",versionListResponseSha256:"pending"},manifest:{key:$manifestKey,versionId:$manifestVersion,contentLength:$manifestBytes,checksum:{algorithm:"SHA256",type:"FULL_OBJECT",providerValue:$manifestChecksum,localValue:$manifestChecksum},headObjectReadAt:$manifestHeadAt,headResponseSha256:"pending",versionListResponseSha256:"pending"},retention:{mode:"COMPLIANCE",retainUntil:$retainUntil,readAt:$retentionAt,responseSha256:"pending"}},rawResponseNames:$rawResponseNames}' >"$CAPTURE_DIR/attestation-input.json" || fail "Federal attestation input assembly failed; preserve owner-only capture" 70
jq --arg payloadHeadSha "$(sha256_hex "$CAPTURE_DIR/payload-head.json")" --arg payloadListSha "$(sha256_hex "$CAPTURE_DIR/payload-versions-after.json")" --arg manifestHeadSha "$(sha256_hex "$CAPTURE_DIR/manifest-head.json")" --arg manifestListSha "$(sha256_hex "$CAPTURE_DIR/manifest-versions-after.json")" --arg retentionSha "$(sha256_hex "$CAPTURE_DIR/payload-retention.json")" '.artifact.payload.headResponseSha256=$payloadHeadSha | .artifact.payload.versionListResponseSha256=$payloadListSha | .artifact.manifest.headResponseSha256=$manifestHeadSha | .artifact.manifest.versionListResponseSha256=$manifestListSha | .artifact.retention.responseSha256=$retentionSha' "$CAPTURE_DIR/attestation-input.json" >"$CAPTURE_DIR/attestation-input.next" && chmod 600 "$CAPTURE_DIR/attestation-input.next" && mv -f "$CAPTURE_DIR/attestation-input.next" "$CAPTURE_DIR/attestation-input.json" || fail "Federal attestation input could not be finalized; preserve owner-only capture" 70
node "$ROOT/scripts/assemble-federal-electoral-promotion-attestation.mjs" --capture-dir "$CAPTURE_DIR" --plan "$PLAN" --approval "$APPROVAL" --iam "$IAM_DESIRED" --live-iam "$IAM_ATTESTATION" --runner "$ROOT/scripts/run-federal-electoral-approved-promotion.sh" --private "$PRIVATE_OUTPUT" --public "$PUBLIC_OUTPUT" || fail "Federal attestation assembly failed; preserve owner-only capture" 70
print -- "Federal primary-only immutable source evidence completed with exact conditional versions, local/provider SHA-256, retention, IAM digests, and durable response digests; no recovery or source-ledger credit was claimed."
