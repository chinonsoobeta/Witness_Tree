#!/bin/zsh
# Owner-local exact recovery for the diagnosed BC/Ontario derived state.
# This path reuses the saved BC payload version, creates only the missing BC
# manifest, uploads only the missing Ontario payload and manifest, and applies
# retention to the saved BC payload version and every exact newly created
# payload or manifest version.
# It never uploads the BC payload, overwrites an existing key, lists/completes
# multipart uploads, deletes, changes IAM, bypasses governance, or writes a
# legal hold.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeWildfireDerivedPromotionUploader"
ACCOUNT="286853118812"
REGION="ca-central-1"
BUCKET="witness-tree-raw-archive-ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKER="$SCRIPT_DIR/check-wildfire-derived-recovery.mjs"
PREPARE="$SCRIPT_DIR/prepare-wildfire-derived-immutable-promotion.mjs"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
MODE=""
APPROVAL=""
STATE=""
ATTESTATION=""
EVIDENCE=""
TMP=""

BC_ID="bc-wildfire-216-feature-derived-2026-08-14"
ON_ID="ontario-in-year-fire-188-feature-derived-2026-08-14"
BC_PAYLOAD="derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/payload/bc-wildfire-216-feature-release.gpkg"
BC_MANIFEST="derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/manifest.json"
ON_PAYLOAD="derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/payload/ontario-in-year-fire-perimeters-188-feature-derived.gpkg"
ON_MANIFEST="derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/manifest.json"
BC_LOCAL="$DATA_ROOT/derived/bc-wildfire-geometry-policy-v1/2026-08-14/bc-wildfire-216-feature-release.gpkg"
ON_LOCAL="$DATA_ROOT/derived/ontario-in-year-fire-geometry-policy-v1/2026-08-14/ontario-in-year-fire-perimeters-188-feature-derived.gpkg"

fail() {
  local message="$1" exit_status=1
  [[ $# -ge 2 ]] && exit_status="$2"
  print -u2 -- "Stopped: $message"
  exit "$exit_status"
}

cleanup() {
  local exit_status=$?
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN totp mfa_serial
  if [[ -n "$TMP" && -d "$TMP" ]]; then rm -rf "$TMP"; fi
  exit "$exit_status"
}
trap cleanup EXIT

if [[ $# -eq 5 && ( "$1" == "--preflight" || "$1" == "--dry-run" ) ]]; then
  MODE="preflight"
elif [[ $# -eq 5 && "$1" == "--recover" ]]; then
  MODE="recover"
else
  fail "Usage: $0 --preflight|--dry-run|--recover /absolute/approval.json /absolute/private-state.json /absolute/applied-iam-attestation.json /absolute/evidence.json" 64
fi
APPROVAL="$2"
STATE="$3"
ATTESTATION="$4"
EVIDENCE="$5"

for input_path in "$APPROVAL" "$STATE" "$ATTESTATION" "$EVIDENCE"; do
  [[ "$input_path" == /* ]] || fail "Approval, state, attestation, and evidence paths must be absolute; no TOTP or AWS call was made" 65
done
[[ -d "$DATA_ROOT" && "$DATA_ROOT" == /* ]] || fail "Derived data root is absent or not absolute; no TOTP or AWS call was made" 65
command -v node >/dev/null || fail "node is required; no TOTP or AWS call was made" 69
command -v jq >/dev/null || fail "jq is required; no TOTP or AWS call was made" 69
command -v aws >/dev/null || fail "aws CLI is required; no TOTP or AWS call was made" 69

for input_path in "$APPROVAL" "$STATE" "$ATTESTATION"; do
  [[ -f "$input_path" && -O "$input_path" && "$(stat -f %Lp "$input_path" 2>/dev/null)" == 600 ]] || fail "Approval, private state, and IAM attestation must be owner-owned mode-600 files; no TOTP or AWS call was made" 65
done
if [[ -e "$EVIDENCE" ]]; then
  [[ -f "$EVIDENCE" && -O "$EVIDENCE" && "$(stat -f %Lp "$EVIDENCE" 2>/dev/null)" == 600 ]] || fail "Existing recovery evidence must be an owner-owned mode-600 file; no TOTP or AWS call was made" 65
fi

TMP="$(mktemp -d /private/tmp/witness-tree-wildfire-derived-recovery.XXXXXX)" || fail "Could not create a private recovery directory" 69
chmod 700 "$TMP"
if ! node "$CHECKER" --preflight "$APPROVAL" "$STATE" "$ATTESTATION" "$DATA_ROOT" "$EVIDENCE" >"$TMP/preflight.stdout" 2>"$TMP/preflight.stderr"; then
  fail "Approval, private state, IAM attestation, or local derived artifacts failed closed; no TOTP or AWS call was made" 65
fi

if [[ -e "$EVIDENCE" && "$(jq -er '.status' "$EVIDENCE" 2>/dev/null)" == "completed" ]]; then
  fail "Recovery evidence is already complete; no TOTP or AWS call was made" 65
fi
if [[ "$MODE" == "recover" && -e "$EVIDENCE" && "$(jq -er '.status' "$EVIDENCE" 2>/dev/null)" == "partial" ]]; then
  fail "Partial recovery evidence requires owner review before any retry; no TOTP or AWS call was made" 65
fi

if [[ "$MODE" == "preflight" ]]; then
  print -- "PRECHECK passed: exact BC payload reuse state, missing-object recovery approval, applied IAM attestation, and local artifacts verified; no TOTP or AWS call was made."
  print -- "DRY-RUN: reuse BC payload version; create BC manifest; upload Ontario payload and manifest; apply/read back payload-and-manifest COMPLIANCE retention through 2033-08-12T00:00:00Z."
  exit 0
fi

# Do not let credentials or profile selectors inherited by the owner wrapper
# influence the operator-profile MFA exchange. The explicit --profile below
# must be the only source of bootstrap credentials; temporary role credentials
# are installed only after the account-bound AssumeRole response is checked.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_ROLE_SESSION_NAME AWS_CONTAINER_CREDENTIALS_RELATIVE_URI AWS_CONTAINER_CREDENTIALS_FULL_URI
wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-derived-recovery >"$TMP/role-session.json"
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' "$TMP/role-session.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' "$TMP/role-session.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' "$TMP/role-session.json")"
account="$(aws sts get-caller-identity --query Account --output text 2>"$TMP/caller.stderr")" || fail "Assumed recovery role identity could not be verified; no storage mutation was authorized" 77
[[ "$account" == "$ACCOUNT" ]] || fail "Assumed recovery role is outside the approved account; no storage mutation was authorized" 77

node "$CHECKER" --validate-fresh-state "$STATE" >"$TMP/fresh-state-after-role.stdout" 2>"$TMP/fresh-state-after-role.stderr" || fail "Private recovery state expired during MFA or role assumption; no storage mutation was authorized" 65

state_version="$(jq -er '.bcPayload.versionId' "$STATE")" || fail "Private BC payload version could not be read; no storage mutation was authorized" 65

head_object() {
  local label="$1" key="$2" version="$3"
  local -a args
  args=(s3api head-object --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json)
  [[ -n "$version" ]] && args+=(--version-id "$version")
  if ! aws "${args[@]}" >"$TMP/$label.json" 2>"$TMP/$label.stderr"; then
    fail "Required exact object head failed; no further write or retention mutation was attempted" 70
  fi
}

guard_absent() {
  local label="$1" key="$2"
  if ! env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE -u AWS_DEFAULT_PROFILE aws s3api head-object --profile default --bucket "$BUCKET" --key "$key" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/$label-guard.json" 2>"$TMP/$label-guard.stderr"; then
    grep -Eq '404|NotFound|NoSuchKey|does not exist' "$TMP/$label-guard.stderr" || fail "Root/default preexisting-key guard could not prove absence; no recovery write was attempted" 70
    return 0
  fi
  if [[ -s "$TMP/$label-guard.json" ]]; then
    fail "Preexisting-key guard found an object; refusing overwrite and no recovery write was attempted" 70
  fi
  fail "Preexisting-key guard returned an unusable response; no recovery write was attempted" 70
}

head_object bc-payload "$BC_PAYLOAD" "$state_version"
node "$CHECKER" --validate-bc-head "$TMP/bc-payload.json" "$STATE" >"$TMP/bc-payload-check.stdout" 2>"$TMP/bc-payload-check.stderr" || fail "Saved BC payload version, bytes, or FULL_OBJECT CRC64NVME failed closed; no recovery write was attempted" 70

# All three guards run before the first PutObject. If any key exists or its
# absence cannot be proved, the runner stops without changing storage.
guard_absent bc-manifest "$BC_MANIFEST"
guard_absent ontario-payload "$ON_PAYLOAD"
guard_absent ontario-manifest "$ON_MANIFEST"

# Persist the preexisting BC proof before any new write. If a later conditional
# operation fails, this owner-only partial checkpoint records that the BC
# payload was never a candidate for re-upload. A subsequent attempt remains
# fail-closed unless all live guards and exact readbacks pass again.
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" bcPayload "$TMP/bc-payload.json" \
  >"$TMP/bc-payload-progress.stdout" 2>"$TMP/bc-payload-progress.stderr" \
  || fail "Private recovery checkpoint could not bind the existing BC payload; no recovery write was attempted" 70

bc_retention_state=""
if aws s3api get-object-retention --bucket "$BUCKET" --key "$BC_PAYLOAD" --version-id "$state_version" --region "$REGION" --output json >"$TMP/bc-retention-before.json" 2>"$TMP/bc-retention-before.stderr"; then
  node "$CHECKER" --validate-retention "$TMP/bc-retention-before.json" >"$TMP/bc-retention-before-check.stdout" 2>"$TMP/bc-retention-before-check.stderr" || fail "Existing BC payload retention is not the exact approved COMPLIANCE date; no recovery write was attempted" 70
  bc_retention_state="present"
elif grep -Eq 'NoSuchObjectLockConfiguration|NoSuchObjectLockConfigurationException' "$TMP/bc-retention-before.stderr"; then
  bc_retention_state="absent"
else
  fail "Existing BC payload retention could not be read; no recovery write was attempted" 70
fi

node "$PREPARE" --write-sidecars "$TMP/sidecars" >"$TMP/sidecars.json" 2>"$TMP/sidecars.stderr" || fail "Deterministic sidecar preparation failed; no recovery write was attempted" 65
BC_SIDECAR_FILE="$TMP/sidecars/${BC_ID}.manifest.json"
ON_SIDECAR_FILE="$TMP/sidecars/${ON_ID}.manifest.json"

put_new() {
  local label="$1" object_name="$2" key="$3" body="$4"
  if ! aws s3api put-object --bucket "$BUCKET" --key "$key" --body "$body" --if-none-match '*' --checksum-algorithm CRC64NVME --region "$REGION" --cli-read-timeout 0 --output json >"$TMP/$label-ack.json" 2>"$TMP/$label-put.stderr"; then
    fail "Exact new-object write failed; no overwrite or delete was attempted" 70
  fi
  node "$CHECKER" --validate-ack "$TMP/$label-ack.json" >"$TMP/$label-ack-check.stdout" 2>"$TMP/$label-ack-check.stderr" || fail "Exact new-object acknowledgement lacked a concrete version or CRC64NVME; no overwrite or delete was attempted" 70
  local version
  version="$(jq -er '.VersionId' "$TMP/$label-ack.json")" || fail "Exact new-object version was absent; no overwrite or delete was attempted" 70
  head_object "$label" "$key" "$version"
  node "$CHECKER" --validate-head "$TMP/$label.json" "$object_name" "$STATE" >"$TMP/$label-head-check.stdout" 2>"$TMP/$label-head-check.stderr" || fail "Exact new-object bytes, version, or FULL_OBJECT CRC64NVME readback failed; no overwrite or delete was attempted" 70
}

put_new bc-manifest bcManifest "$BC_MANIFEST" "$BC_SIDECAR_FILE"
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" bcManifest "$TMP/bc-manifest.json" \
  >"$TMP/bc-manifest-progress.stdout" 2>"$TMP/bc-manifest-progress.stderr" \
  || fail "BC manifest checkpoint failed after the conditional write; no overwrite or delete was attempted" 70
put_new ontario-payload ontarioPayload "$ON_PAYLOAD" "$ON_LOCAL"
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" ontarioPayload "$TMP/ontario-payload.json" \
  >"$TMP/ontario-payload-progress.stdout" 2>"$TMP/ontario-payload-progress.stderr" \
  || fail "Ontario payload checkpoint failed after the conditional write; no overwrite or delete was attempted" 70
put_new ontario-manifest ontarioManifest "$ON_MANIFEST" "$ON_SIDECAR_FILE"
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" ontarioManifest "$TMP/ontario-manifest.json" \
  >"$TMP/ontario-manifest-progress.stdout" 2>"$TMP/ontario-manifest-progress.stderr" \
  || fail "Ontario manifest checkpoint failed after the conditional write; no overwrite or delete was attempted" 70

bc_version="$state_version"
bc_manifest_version="$(jq -er '.VersionId' "$TMP/bc-manifest-ack.json")" || fail "BC manifest version was absent; no retention write was attempted" 70
on_version="$(jq -er '.VersionId' "$TMP/ontario-payload-ack.json")" || fail "Ontario payload version was absent; no retention write was attempted" 70
on_manifest_version="$(jq -er '.VersionId' "$TMP/ontario-manifest-ack.json")" || fail "Ontario manifest version was absent; no retention write was attempted" 70

put_retention() {
  local label="$1" key="$2" version="$3"
  if ! aws s3api put-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" --output json >"$TMP/$label-retention-put.json" 2>"$TMP/$label-retention-put.stderr"; then
    fail "$label COMPLIANCE retention application failed; no other retention write was attempted" 70
  fi
}

read_retention() {
  local label="$1" key="$2" version="$3"
  if ! aws s3api get-object-retention --bucket "$BUCKET" --key "$key" --version-id "$version" --region "$REGION" --output json >"$TMP/$label-retention-after.json" 2>"$TMP/$label-retention-after.stderr"; then
    fail "$label COMPLIANCE retention readback failed; no further mutation was attempted" 70
  fi
  node "$CHECKER" --validate-retention "$TMP/$label-retention-after.json" >"$TMP/$label-retention-after-check.stdout" 2>"$TMP/$label-retention-after-check.stderr" || fail "$label COMPLIANCE retention readback did not match the exact approved date" 70
}

if [[ "$bc_retention_state" == "absent" ]]; then
  put_retention bc-payload "$BC_PAYLOAD" "$bc_version"
fi
put_retention bc-manifest "$BC_MANIFEST" "$bc_manifest_version"
put_retention ontario-payload "$ON_PAYLOAD" "$on_version"
put_retention ontario-manifest "$ON_MANIFEST" "$on_manifest_version"

read_retention bc-payload "$BC_PAYLOAD" "$bc_version"
read_retention bc-manifest "$BC_MANIFEST" "$bc_manifest_version"
read_retention ontario-payload "$ON_PAYLOAD" "$on_version"
read_retention ontario-manifest "$ON_MANIFEST" "$on_manifest_version"

# Final exact-version heads prove the retention calls did not substitute a
# different object. The evidence writer stores the values owner-only mode 600.
head_object bc-payload-final "$BC_PAYLOAD" "$bc_version"
head_object bc-manifest-final "$BC_MANIFEST" "$(jq -er '.VersionId' "$TMP/bc-manifest-ack.json")"
head_object ontario-payload-final "$ON_PAYLOAD" "$on_version"
head_object ontario-manifest-final "$ON_MANIFEST" "$(jq -er '.VersionId' "$TMP/ontario-manifest-ack.json")"
mv "$TMP/bc-payload-final.json" "$TMP/bc-payload-evidence.json"
mv "$TMP/bc-manifest-final.json" "$TMP/bc-manifest-evidence.json"
mv "$TMP/ontario-payload-final.json" "$TMP/ontario-payload-evidence.json"
mv "$TMP/ontario-manifest-final.json" "$TMP/ontario-manifest-evidence.json"

node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" bcPayload "$TMP/bc-payload-evidence.json" bcPayload "$TMP/bc-payload-retention-after.json" \
  >"$TMP/bc-payload-final-progress.stdout" 2>"$TMP/bc-payload-final-progress.stderr" \
  || fail "BC payload final checkpoint failed; no further mutation was attempted" 70
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" bcManifest "$TMP/bc-manifest-evidence.json" bcManifest "$TMP/bc-manifest-retention-after.json" \
  >"$TMP/bc-manifest-final-progress.stdout" 2>"$TMP/bc-manifest-final-progress.stderr" \
  || fail "BC manifest final checkpoint failed; no further mutation was attempted" 70
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" ontarioPayload "$TMP/ontario-payload-evidence.json" ontarioPayload "$TMP/ontario-payload-retention-after.json" \
  >"$TMP/ontario-payload-final-progress.stdout" 2>"$TMP/ontario-payload-final-progress.stderr" \
  || fail "Ontario payload final checkpoint failed; no further mutation was attempted" 70
node "$CHECKER" --record-progress "$APPROVAL" "$STATE" "$EVIDENCE" ontarioManifest "$TMP/ontario-manifest-evidence.json" ontarioManifest "$TMP/ontario-manifest-retention-after.json" \
  >"$TMP/ontario-manifest-final-progress.stdout" 2>"$TMP/ontario-manifest-final-progress.stderr" \
  || fail "Ontario manifest final checkpoint failed; no further mutation was attempted" 70

node "$CHECKER" --write-evidence "$APPROVAL" "$STATE" \
  "$TMP/bc-payload-evidence.json" "$TMP/bc-manifest-evidence.json" \
  "$TMP/ontario-payload-evidence.json" "$TMP/ontario-manifest-evidence.json" \
  "$TMP/bc-payload-retention-after.json" "$TMP/bc-manifest-retention-after.json" "$TMP/ontario-payload-retention-after.json" "$TMP/ontario-manifest-retention-after.json" "$EVIDENCE" \
  >"$TMP/evidence.stdout" 2>"$TMP/evidence.stderr" || fail "Exact recovery evidence failed closed; no further mutation was attempted" 70

print -- "Derived wildfire recovery completed: BC payload version reused, BC manifest created, Ontario payload and manifest created, exact versioned heads and payload-plus-manifest COMPLIANCE retention through 2033-08-12T00:00:00Z verified; owner-only evidence written."
