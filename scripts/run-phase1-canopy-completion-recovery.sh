#!/bin/zsh
# Owner-local post-completion recovery only. This script never completes an
# MPU, uploads or rewrites an object, deletes an object, changes IAM, or uses a
# governance bypass or legal hold.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeArchivePromotionUploader"
ACCOUNT="286853118812"
REGION="ca-central-1"
PRIMARY_BUCKET="witness-tree-raw-archive-ca-central-1"
RECOVERY_BUCKET="witness-tree-raw-recovery-ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKER="$SCRIPT_DIR/check-phase1-canopy-completion-recovery.mjs"
MODE=""
APPROVAL=""
STATE=""
ATTESTATION=""
TMP=""

PRIMARY_PAYLOAD="raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip"
PRIMARY_SIDECAR="raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json"
RECOVERY_PAYLOAD="raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip"
RECOVERY_SIDECAR="raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json"

fail() {
  local message="$1" exit_status=1
  [[ $# -ge 2 ]] && exit_status="$2"
  print -u2 -- "Stopped: $message"
  exit "$exit_status"
}
cleanup() {
  local exit_status=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  if [[ -n "$TMP" && -d "$TMP" ]]; then rm -rf "$TMP"; fi
  exit "$exit_status"
}
trap cleanup EXIT

if [[ $# -eq 4 && "$1" == "--preflight" ]]; then
  MODE="preflight"
elif [[ $# -eq 4 && ( "$1" == "--recover-canopy" || "$1" == "--run" ) ]]; then
  MODE="run"
else
  fail "Usage: $0 --preflight|--recover-canopy /absolute/approval.json /absolute/private-canopy-state.json /absolute/applied-iam-attestation.json" 64
fi
APPROVAL="$2"
STATE="$3"
ATTESTATION="$4"
[[ "$APPROVAL" == /* && "$STATE" == /* && "$ATTESTATION" == /* ]] || fail "Approval, private state, and attestation paths must be absolute; no TOTP or AWS call was made" 65
command -v node >/dev/null || fail "node is required; no TOTP or AWS call was made" 69
command -v jq >/dev/null || fail "jq is required; no TOTP or AWS call was made" 69
command -v aws >/dev/null || fail "aws CLI is required; no TOTP or AWS call was made" 69
[[ -f "$APPROVAL" && -O "$APPROVAL" && "$(stat -f %Lp "$APPROVAL" 2>/dev/null)" == 600 ]] || fail "Approval file must be owner-owned mode-600; no TOTP or AWS call was made" 65
[[ -f "$STATE" && -O "$STATE" && "$(stat -f %Lp "$STATE" 2>/dev/null)" == 600 ]] || fail "Private state must be owner-owned mode-600; no TOTP or AWS call was made" 65
[[ -f "$ATTESTATION" && -O "$ATTESTATION" && "$(stat -f %Lp "$ATTESTATION" 2>/dev/null)" == 600 ]] || fail "Applied IAM attestation must be owner-owned mode-600; no TOTP or AWS call was made" 65
TMP="$(mktemp -d /private/tmp/witness-tree-canopy-recovery.XXXXXX)" || fail "Could not create a private diagnostic directory" 69
chmod 700 "$TMP"

if ! node "$CHECKER" --approval-state "$APPROVAL" "$STATE" >"$TMP/local-check.stdout" 2>"$TMP/local-check.stderr"; then
  fail "Approval or private state failed closed; no TOTP or storage mutation was authorized" 65
fi
if ! node "$CHECKER" --attestation-state "$ATTESTATION" >"$TMP/attestation-check.stdout" 2>"$TMP/attestation-check.stderr"; then
  fail "Applied IAM attestation failed closed; no TOTP or AWS call was made" 65
fi
if [[ "$MODE" == "preflight" ]]; then
  print -- "PRECHECK passed: explicit approval, private 155-part state, and applied root IAM attestation verified; no TOTP or AWS call was made."
  exit 0
fi

wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-canopy-recovery >"$TMP/role-session.json"
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$TMP/role-session.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$TMP/role-session.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$TMP/role-session.json")"
account="$(aws sts get-caller-identity --query Account --output text 2>"$TMP/caller.stderr")" || fail "Assumed recovery role identity could not be verified; no storage mutation was authorized" 77
[[ "$account" == "$ACCOUNT" ]] || fail "Assumed recovery role is outside the approved account; no storage mutation was authorized" 77

state_ref() {
  jq -er --arg field "$1" '.versionRefs[$field] // empty' "$STATE" 2>/dev/null || true
}
head_object() {
  local label="$1" bucket="$2" key="$3" version="$4"
  local -a args
  args=(s3api head-object --bucket "$bucket" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json)
  [[ -n "$version" ]] && args+=(--version-id "$version")
  if ! aws "${args[@]}" >"$TMP/$label.json" 2>"$TMP/$label.stderr"; then
    fail "A required exact object head failed; no sidecar or payload rewrite was attempted" 70
  fi
}

resolve_head() {
  local label="$1" bucket="$2" key="$3" saved_version="$4" discovered_version
  if [[ -n "$saved_version" ]]; then
    head_object "$label" "$bucket" "$key" "$saved_version"
    return
  fi
  head_object "$label-current" "$bucket" "$key" ""
  discovered_version="$(jq -er '.VersionId | select(type == "string" and length > 0)' "$TMP/$label-current.json" 2>/dev/null)" || fail "A required current object version was absent; no retention write was attempted" 70
  head_object "$label" "$bucket" "$key" "$discovered_version"
}

resolve_head primary-payload "$PRIMARY_BUCKET" "$PRIMARY_PAYLOAD" "$(state_ref primaryPayload)"
resolve_head recovery-payload "$RECOVERY_BUCKET" "$RECOVERY_PAYLOAD" "$(state_ref recoveryPayload)"
resolve_head primary-sidecar "$PRIMARY_BUCKET" "$PRIMARY_SIDECAR" "$(state_ref primarySidecar)"
resolve_head recovery-sidecar "$RECOVERY_BUCKET" "$RECOVERY_SIDECAR" "$(state_ref recoverySidecar)"
if ! node "$CHECKER" --heads "$TMP/primary-payload.json" "$TMP/recovery-payload.json" "$TMP/primary-sidecar.json" "$TMP/recovery-sidecar.json" "$STATE" >"$TMP/head-check.stdout" 2>"$TMP/head-check.stderr"; then
  fail "Exact primary/recovery bytes, FULL_OBJECT checksums, or saved version references failed closed" 70
fi
primary_version="$(jq -er '.VersionId' "$TMP/primary-payload.json")" || fail "Primary payload version readback was absent" 70
recovery_version="$(jq -er '.VersionId' "$TMP/recovery-payload.json")" || fail "Recovery payload version readback was absent" 70
primary_sidecar_version="$(jq -er '.VersionId' "$TMP/primary-sidecar.json")" || fail "Primary sidecar version readback was absent" 70
recovery_sidecar_version="$(jq -er '.VersionId' "$TMP/recovery-sidecar.json")" || fail "Recovery sidecar version readback was absent" 70

read_retention() {
  local label="$1" bucket="$2" key="$3" version="$4"
  if aws s3api get-object-retention --bucket "$bucket" --key "$key" --version-id "$version" --region "$REGION" --output json >"$TMP/$label.json" 2>"$TMP/$label.stderr"; then
    print -- "present"
  elif grep -Eq 'NoSuchObjectLockConfiguration|NoSuchObjectLockConfigurationException' "$TMP/$label.stderr"; then
    : >"$TMP/$label.json"
    print -- "absent"
  else
    fail "Exact payload or sidecar retention could not be read; no retention write was attempted" 70
  fi
}
typeset -A retention_state
retention_state[primary-payload]="$(read_retention primary-payload-retention "$PRIMARY_BUCKET" "$PRIMARY_PAYLOAD" "$primary_version")"
retention_state[recovery-payload]="$(read_retention recovery-payload-retention "$RECOVERY_BUCKET" "$RECOVERY_PAYLOAD" "$recovery_version")"
retention_state[primary-sidecar]="$(read_retention primary-sidecar-retention "$PRIMARY_BUCKET" "$PRIMARY_SIDECAR" "$primary_sidecar_version")"
retention_state[recovery-sidecar]="$(read_retention recovery-sidecar-retention "$RECOVERY_BUCKET" "$RECOVERY_SIDECAR" "$recovery_sidecar_version")"
for label in primary-payload recovery-payload primary-sidecar recovery-sidecar; do
  if [[ "${retention_state[$label]}" == "present" ]]; then
    node "$CHECKER" --retention-one "$TMP/$label-retention.json" >"$TMP/$label-retention-check.stdout" 2>"$TMP/$label-retention-check.stderr" || fail "$label retention is not the approved COMPLIANCE date; no retention write was attempted" 70
  fi
done
apply_retention() {
  local label="$1" bucket="$2" key="$3" version="$4"
  if ! aws s3api put-object-retention --bucket "$bucket" --key "$key" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" >"$TMP/$label-retention-put.json" 2>"$TMP/$label-retention-put.stderr"; then fail "$label COMPLIANCE retention application failed" 70; fi
}
[[ "${retention_state[primary-payload]}" == "absent" ]] && apply_retention primary-payload "$PRIMARY_BUCKET" "$PRIMARY_PAYLOAD" "$primary_version"
[[ "${retention_state[recovery-payload]}" == "absent" ]] && apply_retention recovery-payload "$RECOVERY_BUCKET" "$RECOVERY_PAYLOAD" "$recovery_version"
[[ "${retention_state[primary-sidecar]}" == "absent" ]] && apply_retention primary-sidecar "$PRIMARY_BUCKET" "$PRIMARY_SIDECAR" "$primary_sidecar_version"
[[ "${retention_state[recovery-sidecar]}" == "absent" ]] && apply_retention recovery-sidecar "$RECOVERY_BUCKET" "$RECOVERY_SIDECAR" "$recovery_sidecar_version"
read_retention_after() {
  local label="$1" bucket="$2" key="$3" version="$4"
  aws s3api get-object-retention --bucket "$bucket" --key "$key" --version-id "$version" --region "$REGION" --output json >"$TMP/$label-retention-after.json" 2>"$TMP/$label-retention-after.stderr" || fail "$label COMPLIANCE retention readback failed" 70
}
read_retention_after primary-payload "$PRIMARY_BUCKET" "$PRIMARY_PAYLOAD" "$primary_version"
read_retention_after recovery-payload "$RECOVERY_BUCKET" "$RECOVERY_PAYLOAD" "$recovery_version"
read_retention_after primary-sidecar "$PRIMARY_BUCKET" "$PRIMARY_SIDECAR" "$primary_sidecar_version"
read_retention_after recovery-sidecar "$RECOVERY_BUCKET" "$RECOVERY_SIDECAR" "$recovery_sidecar_version"
node "$CHECKER" --retention "$TMP/primary-payload-retention-after.json" "$TMP/recovery-payload-retention-after.json" "$TMP/primary-sidecar-retention-after.json" "$TMP/recovery-sidecar-retention-after.json" >"$TMP/retention-check.stdout" 2>"$TMP/retention-check.stderr" || fail "Payload or sidecar COMPLIANCE retention readback did not match the approved date" 70

# Re-read the exact versions after retention. The sidecars are read only and
# are never rewritten; version-specific heads prove that retention did not
# substitute a different payload or sidecar.
head_object primary-payload-after "$PRIMARY_BUCKET" "$PRIMARY_PAYLOAD" "$primary_version"
head_object recovery-payload-after "$RECOVERY_BUCKET" "$RECOVERY_PAYLOAD" "$recovery_version"
head_object primary-sidecar-after "$PRIMARY_BUCKET" "$PRIMARY_SIDECAR" "$(jq -er '.VersionId' "$TMP/primary-sidecar.json")"
head_object recovery-sidecar-after "$RECOVERY_BUCKET" "$RECOVERY_SIDECAR" "$(jq -er '.VersionId' "$TMP/recovery-sidecar.json")"
jq -n --arg primaryPayload "$primary_version" --arg recoveryPayload "$recovery_version" \
  --arg primarySidecar "$(jq -er '.VersionId' "$TMP/primary-sidecar.json")" \
  --arg recoverySidecar "$(jq -er '.VersionId' "$TMP/recovery-sidecar.json")" \
  '{versionRefs:{primaryPayload:$primaryPayload,recoveryPayload:$recoveryPayload,primarySidecar:$primarySidecar,recoverySidecar:$recoverySidecar}}' >"$TMP/final-version-refs.json"
node "$CHECKER" --heads "$TMP/primary-payload-after.json" "$TMP/recovery-payload-after.json" "$TMP/primary-sidecar-after.json" "$TMP/recovery-sidecar-after.json" "$TMP/final-version-refs.json" >"$TMP/final-head-check.stdout" 2>"$TMP/final-head-check.stderr" || fail "Final exact object readback failed closed" 70
print -- "Canopy post-completion recovery completed: exact primary/recovery payload+sidecar heads and COMPLIANCE retention through 2033-08-12 passed; no multipart completion, upload, sidecar rewrite, delete, governance bypass, or legal-hold operation was attempted."
