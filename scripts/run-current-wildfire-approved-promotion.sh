#!/bin/zsh
set -euo pipefail
umask 077

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
IAM_APPROVAL="${CURRENT_WILDFIRE_IAM_APPROVAL:-$ROOT/data/current-wildfire-get-object-version-owner-approval.json}"
IAM_LIVE="${CURRENT_WILDFIRE_IAM_LIVE_ATTESTATION:-$ROOT/data/current-wildfire-promotion-iam-live-attestation.json}"
cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds totp; [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }

if [[ $# -eq 0 ]]; then node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs"; exit 0; fi
[[ ( "${1:-}" == "--preflight" && $# -eq 1 ) || ( "${1:-}" == "--run" && $# -eq 4 ) ]] || fail "Usage: $0 --preflight | --run /absolute/private-checkpoint.json /absolute/private-attestation.json /absolute/redacted-attestation.json" 64
if [[ "${1:-}" == "--run" ]]; then
  CHECKPOINT="$2"; PRIVATE_OUTPUT="$3"; PUBLIC_OUTPUT="$4"
  [[ "$CHECKPOINT" == /* && "$PRIVATE_OUTPUT" == /* && "$PUBLIC_OUTPUT" == /* ]] || fail "Checkpoint and attestation paths must be absolute; no TOTP or AWS call was made" 65
  [[ "$CHECKPOINT" != "$PRIVATE_OUTPUT" && "$CHECKPOINT" != "$PUBLIC_OUTPUT" && "$PRIVATE_OUTPUT" != "$PUBLIC_OUTPUT" ]] || fail "Checkpoint and attestation paths must be distinct; no TOTP or AWS call was made" 65
  [[ ! -e "$PRIVATE_OUTPUT" && ! -L "$PRIVATE_OUTPUT" && ! -e "$PUBLIC_OUTPUT" && ! -L "$PUBLIC_OUTPUT" ]] || fail "Attestation outputs must be new; no TOTP or AWS call was made" 65
  CHECKPOINT_PARENT="${CHECKPOINT:h}"
  [[ -d "$CHECKPOINT_PARENT" && ! -L "$CHECKPOINT_PARENT" && "$(stat -f %u "$CHECKPOINT_PARENT")" == "$(id -u)" && "$(stat -f %Lp "$CHECKPOINT_PARENT")" == 700 ]] || fail "Checkpoint parent must be an existing owner-only non-symlink directory; no TOTP or AWS call was made" 65
  if [[ -e "$CHECKPOINT" || -L "$CHECKPOINT" ]]; then
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --assert-runnable "$CHECKPOINT" >/dev/null || fail "Existing checkpoint is not safely resumable; owner review is required and no TOTP or AWS call was made" 65
  else
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --init "$CHECKPOINT" >/dev/null || fail "Private checkpoint could not be created; no TOTP or AWS call was made" 65
  fi
  STATE_DIR="$CHECKPOINT.files"; RESPONSE_DIR="$CHECKPOINT.responses"
  for directory in "$STATE_DIR" "$RESPONSE_DIR"; do
    if [[ ! -e "$directory" && ! -L "$directory" ]]; then mkdir -m 700 -- "$directory" || fail "Owner-only checkpoint state directory could not be created; no TOTP or AWS call was made" 65; fi
    [[ -d "$directory" && ! -L "$directory" && "$(stat -f %u "$directory")" == "$(id -u)" && "$(stat -f %Lp "$directory")" == 700 ]] || fail "Checkpoint state directory is not owner-only; no TOTP or AWS call was made" 65
  done
fi
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
for gate_file in "$IAM_APPROVAL" "$IAM_LIVE"; do [[ -f "$gate_file" && ! -L "$gate_file" && "$(stat -f %u "$gate_file")" == "$(id -u)" && "$(stat -f %Lp "$gate_file")" == 600 ]] || fail "IAM gate input must be an owner-owned mode-600 regular file; no TOTP or AWS call was made" 75; done
node "$ROOT/scripts/check-current-wildfire-promotion-iam.mjs" --require-live --approval "$IAM_APPROVAL" --live "$IAM_LIVE" >/dev/null || fail "Separate GetObjectVersion owner approval or exact live IAM attestation is absent; no TOTP or AWS call was made" 75
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
TMP="$(mktemp -d /private/tmp/witness-tree-current-wildfire-approved-promotion.XXXXXX)"; chmod 700 "$TMP"
node "$ROOT/scripts/prepare-current-wildfire-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null
for i in {1..4}; do
  for kind in payload manifest; do
    prep_status="$(jq -r --arg id "${IDS[$i]}" --arg kind "$kind" '.objects[] | select(.artifactId==$id and .kind==$kind) | .status' "$CHECKPOINT")"
    if [[ "$prep_status" == pending ]]; then
      [[ "$kind" == payload ]] && source_file="${FILES[$i]}" || source_file="$TMP/${IDS[$i]}.manifest.json"
      stable_file="$STATE_DIR/${IDS[$i]}.$kind.bin"
      stable_bytes="$(jq -r --arg id "${IDS[$i]}" --arg kind "$kind" '.objects[] | select(.artifactId==$id and .kind==$kind) | .bytes' "$CHECKPOINT")"
      stable_sha="$(jq -r --arg id "${IDS[$i]}" --arg kind "$kind" '.objects[] | select(.artifactId==$id and .kind==$kind) | .sha256' "$CHECKPOINT")"
      node "$ROOT/scripts/current-wildfire-stable-file.mjs" --source "$source_file" --destination "$stable_file" --bytes "$stable_bytes" --sha256 "$stable_sha" >"$TMP/stable.json" || fail "Exact stable $kind copy could not be prepared; no TOTP or AWS call was made" 70
      node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-prepared "$CHECKPOINT" "${IDS[$i]}" "$kind" "$TMP/stable.json" >/dev/null || fail "Stable $kind copy could not be checkpoint-bound; no TOTP or AWS call was made" 70
    fi
  done
done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator$' ]] || fail "Configured MFA serial is absent or does not name the approved operator; no STS or AWS storage call was made" 69
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77; unset totp
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$bootstrap")"; unset bootstrap
aws sts get-caller-identity --output json >"$TMP/operator-identity.json" 2>"$TMP/operator-identity.stderr" || fail "Cannot identify MFA session" 77
jq -e '.Account=="286853118812" and .Arn=="arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"' "$TMP/operator-identity.json" >/dev/null || fail "MFA session is not the exact approved operator" 77
creds="$(aws sts assume-role --role-arn "arn:aws:iam::286853118812:role/${ROLE}" --role-session-name witness-tree-current-wildfire-approved-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds
aws sts get-caller-identity --output json >"$TMP/role-identity.json" 2>"$TMP/role-identity.stderr" || fail "Cannot identify assumed promotion role" 77
node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-identity "$CHECKPOINT" "$TMP/operator-identity.json" "$TMP/role-identity.json" >/dev/null || fail "Exact operator and role identity could not be bound to the checkpoint" 70
record_evidence() {
  local name command_json stdout_file stderr_file evidence_file
  name="$1"; command_json="$2"; stdout_file="$3"; stderr_file="$4"; evidence_file="$RESPONSE_DIR/$name"
  [[ ! -e "$evidence_file" && ! -L "$evidence_file" ]] || fail "Response evidence already exists or is aliased" 70
  jq -n --argjson command "$command_json" --rawfile stdout "$stdout_file" --rawfile stderr "$stderr_file" '{command:$command,stdout:$stdout,stderr:$stderr}' >"$evidence_file" && chmod 600 "$evidence_file" || fail "Response evidence could not be written" 70
  node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-evidence "$CHECKPOINT" "$name" "$evidence_file" >/dev/null || fail "Response evidence is outside the exact inventory" 70
}
record_evidence operator-identity.evidence.json '["aws","sts","get-caller-identity","--output","json"]' "$TMP/operator-identity.json" "$TMP/operator-identity.stderr"
record_evidence role-identity.evidence.json '["aws","sts","get-caller-identity","--output","json"]' "$TMP/role-identity.json" "$TMP/role-identity.stderr"
for i in {1..4}; do
  payload_status="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .status' "$CHECKPOINT")"
  payload_body="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .localCopy.path' "$CHECKPOINT")"
  payload_checksum="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .localCopy.checksumValue' "$CHECKPOINT")"
  if [[ "$payload_status" == stable-copy-prepared ]]; then
    node "$ROOT/scripts/current-wildfire-stable-file.mjs" --verify --source "$payload_body" --device "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .localCopy.device' "$CHECKPOINT")" --inode "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .localCopy.inode' "$CHECKPOINT")" --bytes "${BYTES[$i]}" --sha256 "${SHAS[$i]}" --checksum "$payload_checksum" >/dev/null || fail "Stable payload identity or checksum drifted; no write was attempted" 70
    print -- "Uploading approved raw payload $i/4 by direct conditional PutObject; wait for its acknowledgement."
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-write-started "$CHECKPOINT" "${IDS[$i]}" payload >/dev/null || fail "Payload checkpoint is not writable; no duplicate write was attempted" 70
    if ! aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "$payload_body" --if-none-match '*' --checksum-algorithm CRC64NVME --checksum-crc64-nvme "$payload_checksum" --region "$REGION" --cli-read-timeout 0 --output json >"$TMP/payload-put.json" 2>"$TMP/payload-put.stderr"; then node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-ambiguous "$CHECKPOINT" "${IDS[$i]}" payload unused put-object >/dev/null; fail "Payload write response was not accepted; owner review is required and retry is blocked" 70; fi
    record_evidence "${IDS[$i]}.payload.put-object.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${PAYLOADS[$i]}" --arg checksum "$payload_checksum" '["aws","s3api","put-object","--bucket",$b,"--key",$k,"--body","<stable-owner-copy>","--if-none-match","*","--checksum-algorithm","CRC64NVME","--checksum-crc64-nvme",$checksum]')" "$TMP/payload-put.json" "$TMP/payload-put.stderr"
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-ack "$CHECKPOINT" "${IDS[$i]}" payload "$TMP/payload-put.json" >/dev/null || fail "Payload upload acknowledgement incomplete; retry is blocked" 70
    payload_status=acknowledged
  fi
  version="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="payload") | .ack.VersionId // empty' "$CHECKPOINT")"
  if [[ "$payload_status" == acknowledged ]]; then
    aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/payload-head.json" 2>"$TMP/payload-head.stderr" || fail "Exact payload-version read-back failed; checkpoint preserves the acknowledged version" 70
    record_evidence "${IDS[$i]}.payload.head-object.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${PAYLOADS[$i]}" '["aws","s3api","head-object","--bucket",$b,"--key",$k,"--version-id","<checkpoint-version>","--checksum-mode","ENABLED"]')" "$TMP/payload-head.json" "$TMP/payload-head.stderr"
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-head "$CHECKPOINT" "${IDS[$i]}" payload "$TMP/payload-head.json" >/dev/null || fail "Exact payload-version read-back mismatch" 70
    payload_status=readback-verified
  fi
  if [[ "$payload_status" == readback-verified ]]; then
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-retention-started "$CHECKPOINT" "${IDS[$i]}" >/dev/null || fail "Retention checkpoint failed" 70
    if ! aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" --output json >"$TMP/retention-put.json" 2>"$TMP/retention-put.stderr"; then node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-ambiguous "$CHECKPOINT" "${IDS[$i]}" payload unused put-object-retention >/dev/null; fail "Retention response was not accepted; owner review is required and retry is blocked" 70; fi
    record_evidence "${IDS[$i]}.payload.put-object-retention.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${PAYLOADS[$i]}" --arg until "$RETAIN_UNTIL" '["aws","s3api","put-object-retention","--bucket",$b,"--key",$k,"--version-id","<checkpoint-version>","--retention",("Mode=COMPLIANCE,RetainUntilDate="+$until)]')" "$TMP/retention-put.json" "$TMP/retention-put.stderr"
    aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --output json >"$TMP/retention-get.json" 2>"$TMP/retention-get.stderr" || fail "Retention read-back failed; owner review is required before any retry" 70
    record_evidence "${IDS[$i]}.payload.get-object-retention.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${PAYLOADS[$i]}" '["aws","s3api","get-object-retention","--bucket",$b,"--key",$k,"--version-id","<checkpoint-version>"]')" "$TMP/retention-get.json" "$TMP/retention-get.stderr"
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-retention "$CHECKPOINT" "${IDS[$i]}" "$TMP/retention-put.json" "$TMP/retention-get.json" >/dev/null || fail "Payload retention read-back mismatch" 70
  fi
  manifest_status="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .status' "$CHECKPOINT")"
  manifest_body="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .localCopy.path' "$CHECKPOINT")"
  manifest_checksum="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .localCopy.checksumValue' "$CHECKPOINT")"
  if [[ "$manifest_status" == stable-copy-prepared ]]; then
    node "$ROOT/scripts/current-wildfire-stable-file.mjs" --verify --source "$manifest_body" --device "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .localCopy.device' "$CHECKPOINT")" --inode "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .localCopy.inode' "$CHECKPOINT")" --bytes "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .bytes' "$CHECKPOINT")" --sha256 "$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .sha256' "$CHECKPOINT")" --checksum "$manifest_checksum" >/dev/null || fail "Stable manifest identity or checksum drifted; no write was attempted" 70
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-write-started "$CHECKPOINT" "${IDS[$i]}" manifest >/dev/null || fail "Manifest checkpoint is not writable; no duplicate write was attempted" 70
    if ! aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$manifest_body" --if-none-match '*' --checksum-algorithm CRC64NVME --checksum-crc64-nvme "$manifest_checksum" --region "$REGION" --cli-read-timeout 0 --output json >"$TMP/manifest-put.json" 2>"$TMP/manifest-put.stderr"; then node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-ambiguous "$CHECKPOINT" "${IDS[$i]}" manifest unused put-object >/dev/null; fail "Manifest write response was not accepted; owner review is required and retry is blocked" 70; fi
    record_evidence "${IDS[$i]}.manifest.put-object.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${SIDECARS[$i]}" --arg checksum "$manifest_checksum" '["aws","s3api","put-object","--bucket",$b,"--key",$k,"--body","<stable-owner-copy>","--if-none-match","*","--checksum-algorithm","CRC64NVME","--checksum-crc64-nvme",$checksum]')" "$TMP/manifest-put.json" "$TMP/manifest-put.stderr"
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-ack "$CHECKPOINT" "${IDS[$i]}" manifest "$TMP/manifest-put.json" >/dev/null || fail "Manifest upload acknowledgement incomplete; retry is blocked" 70
    manifest_status=acknowledged
  fi
  sidecar_version="$(jq -r --arg id "${IDS[$i]}" '.objects[] | select(.artifactId==$id and .kind=="manifest") | .ack.VersionId // empty' "$CHECKPOINT")"
  if [[ "$manifest_status" == acknowledged ]]; then
    aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --version-id "$sidecar_version" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/manifest-head.json" 2>"$TMP/manifest-head.stderr" || fail "Exact manifest-version read-back failed; checkpoint preserves the acknowledged version" 70
    record_evidence "${IDS[$i]}.manifest.head-object.evidence.json" "$(jq -cn --arg b "$BUCKET" --arg k "${SIDECARS[$i]}" '["aws","s3api","head-object","--bucket",$b,"--key",$k,"--version-id","<checkpoint-version>","--checksum-mode","ENABLED"]')" "$TMP/manifest-head.json" "$TMP/manifest-head.stderr"
    node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --record-head "$CHECKPOINT" "${IDS[$i]}" manifest "$TMP/manifest-head.json" >/dev/null || fail "Exact manifest-version read-back mismatch" 70
    manifest_status=readback-verified
  fi
  [[ "$manifest_status" != readback-verified ]] || node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --mark-manifest-complete "$CHECKPOINT" "${IDS[$i]}" >/dev/null || fail "Manifest completion checkpoint failed" 70
done
node "$ROOT/scripts/check-current-wildfire-promotion-checkpoint.mjs" --complete "$CHECKPOINT" >/dev/null || fail "Promotion checkpoint could not be completed" 70
node "$ROOT/scripts/assemble-current-wildfire-promotion-attestation.mjs" "$CHECKPOINT" "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT" || fail "Durable attestation pair publication failed; inspect output state" 70
print -- "Archive promotion and owner-only digest-bound attestation completed; this does not prove recovery replication or clear downstream admission blocks."
