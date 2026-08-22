#!/bin/zsh
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeArchivePromotionUploader"
ACCOUNT="286853118812"
OPERATOR_ARN="arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
ROOT="${0:A:h:h}"
SOURCE_ID="elections-canada-federal-electoral-districts-45th-general-election-2025-shp"
PAYLOAD="$DATA_ROOT/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip"
BYTES=10301648
SHA256="4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93"
PAYLOAD_KEY="raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip"
MANIFEST_KEY="raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/manifest.json"
PRIVATE_OUTPUT="${FEDERAL_PRIVATE_OUTPUT:-/private/tmp/witness-tree-federal-electoral-promotion-attestation.json}"
PUBLIC_OUTPUT="${FEDERAL_PUBLIC_OUTPUT:-/private/tmp/witness-tree-federal-electoral-promotion-attestation-redacted.json}"
CAPTURE_DIR=""
REMOTE_MUTATION=0

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
remove_owned_capture() {
  local name
  [[ "$CAPTURE_DIR" =~ '^/private/tmp/witness-tree-federal-electoral-promotion-capture\.[A-Za-z0-9]{6}$' ]] || return 1
  [[ -d "$CAPTURE_DIR" && ! -L "$CAPTURE_DIR" && "$(stat -f %u "$CAPTURE_DIR")" == "$(id -u)" ]] || return 1
  for name in payload-absence.stderr payload-unexpected.json manifest-absence.stderr manifest-unexpected.json manifest.json payload-put.json payload-head.json retention.json manifest-put.json manifest-head.json attestation-input.json; do
    [[ ! -L "$CAPTURE_DIR/$name" ]] || return 1
    [[ ! -e "$CAPTURE_DIR/$name" ]] || rm -f -- "$CAPTURE_DIR/$name" || return 1
  done
  rmdir -- "$CAPTURE_DIR"
}
cleanup() {
  local exit_status=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  if [[ -n "$CAPTURE_DIR" && -d "$CAPTURE_DIR" ]]; then
    if (( exit_status == 0 || REMOTE_MUTATION == 0 )); then
      remove_owned_capture || { print -u2 -- "Stopped: owner-only capture cleanup could not be proved; inspect local capture state."; exit_status=70; }
    else
      print -u2 -- "Stopped after a remote mutation; owner-only recovery capture was preserved."
    fi
  fi
  exit "$exit_status"
}
trap cleanup EXIT

[[ $# -eq 1 && ( "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 --preflight|--run" 64
[[ -f "$PAYLOAD" ]] || fail "Approved federal payload is missing; no TOTP or AWS call was made" 65
[[ "$(stat -f %z "$PAYLOAD")" == "$BYTES" ]] || fail "Approved federal byte length drifted; no TOTP or AWS call was made" 65
[[ "$(shasum -a 256 "$PAYLOAD" | awk '{print $1}')" == "$SHA256" ]] || fail "Approved federal SHA-256 drifted; no TOTP or AWS call was made" 65
print -- "Federal PRECHECK passed: exact local payload identity; no TOTP or AWS call was made."
[[ "$1" == "--preflight" ]] && exit 0

command -v jq >/dev/null || fail "jq is required" 69
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v node >/dev/null || fail "node is required" 69
for output in "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT"; do [[ ! -e "$output" && ! -L "$output" ]] || fail "Attestation output already exists; inspect output state before any AWS call" 73; done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64

read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or storage call was made" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"
unset bootstrap
identity="$(aws sts get-caller-identity --output json)" || fail "Cannot identify MFA session" 77
jq -e --arg account "$ACCOUNT" --arg arn "$OPERATOR_ARN" '.Account == $account and .Arn == $arn' <<<"$identity" >/dev/null || fail "MFA session is not the exact approved operator" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --role-session-name witness-tree-federal-electoral-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$creds")"
unset creds

CAPTURE_DIR="$(mktemp -d /private/tmp/witness-tree-federal-electoral-promotion-capture.XXXXXX)"
chmod 700 "$CAPTURE_DIR"

prove_absent() {
  local label="$1" key="$2" stderr_file code
  stderr_file="$CAPTURE_DIR/${label}-absence.stderr"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$CAPTURE_DIR/${label}-unexpected.json" 2>"$stderr_file"; then
    fail "Approved federal destination already exists; no write was attempted" 73
  fi
  code="$(sed -n 's/.*(\([^)]*\)).*/\1/p' "$stderr_file" | tail -1)"
  [[ "$code" == "404" || "$code" == "NotFound" || "$code" == "NoSuchKey" ]] || fail "Cannot unambiguously classify approved federal destination state; no write was attempted" 70
}

prove_absent payload "$PAYLOAD_KEY"
prove_absent manifest "$MANIFEST_KEY"

jq -n --arg id "$SOURCE_ID" --arg payload "$PAYLOAD_KEY" --arg sha "$SHA256" --argjson bytes "$BYTES" '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, release, or production admission."}' >"$CAPTURE_DIR/manifest.json"
manifest_bytes="$(stat -f %z "$CAPTURE_DIR/manifest.json")"

REMOTE_MUTATION=1
aws s3api put-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --body "$PAYLOAD" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json >"$CAPTURE_DIR/payload-put.json" || fail "Federal payload upload outcome is uncertain; inspect owner-only recovery capture" 70
payload_version="$(jq -er '.VersionId' "$CAPTURE_DIR/payload-put.json")" || fail "Federal payload acknowledgement is incomplete" 70
payload_crc="$(jq -er '.ChecksumCRC64NVME' "$CAPTURE_DIR/payload-put.json")" || fail "Federal payload acknowledgement is incomplete" 70
aws s3api head-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --checksum-mode ENABLED --region "$REGION" --output json >"$CAPTURE_DIR/payload-head.json" || fail "Federal payload exact-version read-back failed" 70
jq -e --arg version "$payload_version" --arg crc "$payload_crc" --argjson bytes "$BYTES" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumCRC64NVME == $crc' "$CAPTURE_DIR/payload-head.json" >/dev/null || fail "Federal payload exact-version read-back mismatch" 70
aws s3api put-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >/dev/null || fail "Federal payload COMPLIANCE retention application failed" 70
aws s3api get-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$payload_version" --region "$REGION" --output json >"$CAPTURE_DIR/retention.json" || fail "Federal payload retention read-back failed" 70
jq -e '.Retention.Mode == "COMPLIANCE"' "$CAPTURE_DIR/retention.json" >/dev/null && node -e 'const [a,b]=process.argv.slice(1).map(Date.parse); if (!Number.isFinite(a) || a !== b) process.exit(1)' "$(jq -er '.Retention.RetainUntilDate' "$CAPTURE_DIR/retention.json")" "$RETAIN_UNTIL" || fail "Federal payload retention read-back mismatch" 70

aws s3api put-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --body "$CAPTURE_DIR/manifest.json" --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json >"$CAPTURE_DIR/manifest-put.json" || fail "Federal manifest upload outcome is uncertain; inspect owner-only recovery capture" 70
manifest_version="$(jq -er '.VersionId' "$CAPTURE_DIR/manifest-put.json")" || fail "Federal manifest acknowledgement is incomplete" 70
manifest_crc="$(jq -er '.ChecksumCRC64NVME' "$CAPTURE_DIR/manifest-put.json")" || fail "Federal manifest acknowledgement is incomplete" 70
aws s3api head-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --version-id "$manifest_version" --checksum-mode ENABLED --region "$REGION" --output json >"$CAPTURE_DIR/manifest-head.json" || fail "Federal manifest exact-version read-back failed" 70
jq -e --arg version "$manifest_version" --arg crc "$manifest_crc" --argjson bytes "$manifest_bytes" '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT" and .ChecksumCRC64NVME == $crc' "$CAPTURE_DIR/manifest-head.json" >/dev/null || fail "Federal manifest exact-version read-back mismatch" 70

jq -n --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson identity "$identity" --arg sourceId "$SOURCE_ID" --argjson byteLength "$BYTES" --arg localSha256 "$SHA256" --arg payloadKey "$PAYLOAD_KEY" --arg payloadVersion "$payload_version" --arg payloadCrc "$payload_crc" --arg manifestKey "$MANIFEST_KEY" --arg manifestVersion "$manifest_version" --arg manifestCrc "$manifest_crc" --argjson manifestBytes "$manifest_bytes" --arg retainUntil "$RETAIN_UNTIL" '{schemaVersion:"witness-tree/federal-electoral-promotion-attestation/1",createdAt:$createdAt,operator:{Account:$identity.Account,Arn:$identity.Arn},artifact:{sourceId:$sourceId,byteLength:$byteLength,localSha256:$localSha256,payload:{key:$payloadKey,versionId:$payloadVersion,checksumCRC64NVME:$payloadCrc,checksumType:"FULL_OBJECT",contentLength:$byteLength},manifest:{key:$manifestKey,versionId:$manifestVersion,checksumCRC64NVME:$manifestCrc,checksumType:"FULL_OBJECT",contentLength:$manifestBytes},retention:{mode:"COMPLIANCE",retainUntil:$retainUntil}},claims:{transformed:false,ingested:false,released:false,productionAdmission:false,productionEligible:false}}' >"$CAPTURE_DIR/attestation-input.json"
node "$ROOT/scripts/assemble-federal-electoral-promotion-attestation.mjs" "$CAPTURE_DIR/attestation-input.json" "$ROOT/data/elections-canada-fed-2025-promotion-preparation.json" "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT" || fail "Federal attestation assembly failed; inspect output state" 70
print -- "Federal electoral immutable promotion completed with exact version, checksum, retention, and owner-only attestation evidence; no downstream admission is implied."
