#!/usr/bin/env bash
# Owner-local Phase 1 archive control exercise. Do not run with root credentials.
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
REGION="ca-central-1"
PRIMARY_BUCKET="witness-tree-raw-archive-ca-central-1"
RECOVERY_BUCKET="witness-tree-raw-recovery-ca-central-1"
UPLOADER_ROLE="WitnessTreeArchiveUploader"
BREAK_GLASS_ROLE="WitnessTreeArchiveRetentionBreakGlass"
VERIFIER_ROLE="WitnessTreeArchiveVerifier"
CLI_CONNECT_TIMEOUT=10
CLI_READ_TIMEOUT=15
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Bash 3.2 treats an empty array expansion as unbound under `set -u`.
# This non-code sentinel makes the loop portable and can never match a TOTP.
USED_TOTPS=("not-a-totp")

usage() {
  cat <<'EOF'
Usage:
  scripts/run-phase1-archive-owner-exercise.sh --preflight [--profile WitnessTreeArchiveOperator]
  scripts/run-phase1-archive-owner-exercise.sh --run [--profile WitnessTreeArchiveOperator]
  scripts/run-phase1-archive-owner-exercise.sh --recover-latest [--profile WitnessTreeArchiveOperator]

This owner-local command securely prompts for the current virtual-MFA TOTP. It never
prints or writes the TOTP, access-key secret, STS credentials, account ID, ARNs, or
object version ID. AWS diagnostics are retained locally in a 0700 temporary directory.

--preflight makes only a read-only GetCallerIdentity call and reads this profile's
locally configured MFA serial. It asks for no TOTP and attempts no AWS mutation.

--recover-latest only locates the newest version under the dedicated legal-hold
exercise prefix through the read-only verifier role, reads its hold and retention,
removes that hold through the break-glass role, and verifies that retention did not
change. It never deletes an object or alters retention.
EOF
}
phase() { printf 'Phase: %s\n' "$1"; }
fail() { printf 'Stopped: %s\n' "$1" >&2; exit "${2:-1}"; }

mode="${1:-}"
[[ "$mode" == "--preflight" || "$mode" == "--run" || "$mode" == "--recover-latest" ]] || { usage; exit 64; }
shift
if [[ "${1:-}" == "--profile" ]]; then PROFILE="${2:?--profile requires a value}"; shift 2; fi
[[ $# -eq 0 ]] || { usage; exit 64; }
command -v aws >/dev/null || fail "aws CLI is required." 69
command -v jq >/dev/null || fail "jq is required." 69

evidence_dir="$(mktemp -d /private/tmp/witness-tree-archive-exercise.XXXXXX)"
chmod 700 "$evidence_dir"
evidence="$evidence_dir/redacted-readback.json"
run_aws() {
  local label="$1"; shift
  if ! aws --cli-connect-timeout "$CLI_CONNECT_TIMEOUT" --cli-read-timeout "$CLI_READ_TIMEOUT" "$@" 2>"$evidence_dir/${label}.stderr"; then
    printf 'AWS %s failed. Private diagnostic: %s\n' "$label" "$evidence_dir/${label}.stderr" >&2
    return 1
  fi
}
assert_retention_readback() {
  local readback="$1" actual
  jq -e '.Retention.Mode == "COMPLIANCE"' <<<"$readback" >/dev/null || fail "Retention readback is not compliance mode."
  actual="$(jq -er '.Retention.RetainUntilDate' <<<"$readback")" || fail "Retention readback has no retention instant."
  node -e 'const [wanted, actual] = process.argv.slice(1); if (Date.parse(wanted) !== Date.parse(actual)) process.exit(1)' "$retention_until" "$actual" || fail "Retention readback does not match the requested instant."
}
assert_same_retention() {
  local before="$1" after="$2"
  node -e 'const [before, after] = process.argv.slice(1).map(JSON.parse); if (before.Mode !== "COMPLIANCE" || after.Mode !== "COMPLIANCE" || Date.parse(before.RetainUntilDate) !== Date.parse(after.RetainUntilDate)) process.exit(1)' \
    "$(jq -c '.Retention' <<<"$before")" "$(jq -c '.Retention' <<<"$after")" || fail "Recovery changed compliance retention."
}
cleanup_legal_hold() {
  local status=$?
  if [[ "${hold_cleanup_required:-0}" == 1 ]]; then
    phase "best-effort cleanup: set the exercise legal hold OFF"
    use_role BREAK_GLASS || true
    run_aws cleanup-legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null || true
  fi
  exit "$status"
}

phase "verify the configured no-console operator identity"
identity="$(run_aws identity --profile "$PROFILE" sts get-caller-identity --output json)"
account_id="$(jq -er '.Account | select(test("^[0-9]{12}$"))' <<<"$identity")"
[[ "$account_id" == "286853118812" ]] || fail "Configured profile is outside the approved account."
jq -er --arg account "$account_id" '.Arn == ("arn:aws:iam::" + $account + ":user/WitnessTreeArchiveOperator")' <<<"$identity" >/dev/null || fail "Configured profile must authenticate as WitnessTreeArchiveOperator."
unset identity
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>"$evidence_dir/mfa-serial.stderr" || true)"
[[ "$mfa_serial" =~ ^arn:aws:iam::${account_id}:mfa/[A-Za-z0-9+=,.@_/-]+$ ]] || fail "Set this profile's exact account-scoped virtual-MFA serial locally, then retry."
[[ "$mode" == "--preflight" ]] && { printf 'PRECHECK passed: configured profile identity and account-scoped MFA serial match; no TOTP was requested and no AWS mutation was attempted.\n'; exit 0; }

obtain_role() {
  local role="$1" prefix="$2" totp response attempt diagnostic used duplicate
  response=""
  attempt=0
  while [[ "$attempt" -lt 3 ]]; do
    phase "directly assume approved ${role} role with a fresh operator MFA value ($((attempt + 1))/3)"
    read -r -s -p "Current TOTP for ${role} (not saved): " totp
    printf '\n'
    [[ "$totp" =~ ^[0-9]{6}$ ]] || fail "TOTP must contain exactly 6 digits." 64
    duplicate=0
    for used in "${USED_TOTPS[@]}"; do [[ "$totp" == "$used" ]] && duplicate=1; done
    if [[ "$duplicate" == 1 ]]; then
      printf 'That MFA value already opened an earlier role session. Wait for the authenticator to rotate, then enter the new value.\n' >&2
      unset totp
      continue
    fi
    attempt=$((attempt + 1))
    if response="$(run_aws "assume-${role}" --profile "$PROFILE" sts assume-role --role-arn "arn:aws:iam::${account_id}:role/${role}" --role-session-name "WitnessTreeArchiveExercise-$(date -u +%Y%m%dT%H%M%SZ)" --serial-number "$mfa_serial" --token-code "$totp" --duration-seconds 43200 --output json)"; then
      USED_TOTPS+=("$totp")
      break
    fi
    diagnostic="$evidence_dir/assume-${role}.stderr"
    if ! grep -q 'MultiFactorAuthentication failed with invalid MFA one time pass code' "$diagnostic"; then
      fail "AssumeRole failed for a reason other than an invalid MFA value; inspect the private diagnostic."
    fi
    [[ "$attempt" -lt 3 ]] || fail "Three distinct MFA values were rejected; no AWS storage call was made." 77
    printf 'That MFA value was rejected. Wait for a newly rotated value, then retry this role.\n' >&2
    unset totp
  done
  [[ -n "$response" ]] || fail "No approved role session was returned." 77
  printf -v "${prefix}_ACCESS_KEY_ID" '%s' "$(jq -er '.Credentials.AccessKeyId' <<<"$response")"
  printf -v "${prefix}_SECRET_ACCESS_KEY" '%s' "$(jq -er '.Credentials.SecretAccessKey' <<<"$response")"
  printf -v "${prefix}_SESSION_TOKEN" '%s' "$(jq -er '.Credentials.SessionToken' <<<"$response")"
  unset totp response
}
use_role() {
  local prefix="$1" access secret token
  access="${prefix}_ACCESS_KEY_ID"; secret="${prefix}_SECRET_ACCESS_KEY"; token="${prefix}_SESSION_TOKEN"
  export AWS_ACCESS_KEY_ID="${!access}"
  export AWS_SECRET_ACCESS_KEY="${!secret}"
  export AWS_SESSION_TOKEN="${!token}"
}

if [[ "$mode" == "--recover-latest" ]]; then
  obtain_role "$VERIFIER_ROLE" VERIFIER
  obtain_role "$BREAK_GLASS_ROLE" BREAK_GLASS
else
  obtain_role "$UPLOADER_ROLE" UPLOADER
  obtain_role "$BREAK_GLASS_ROLE" BREAK_GLASS
  obtain_role "$VERIFIER_ROLE" VERIFIER
fi

read_legal_hold() {
  run_aws "$1" --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json
}
read_retention() {
  run_aws "$1" --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json
}

if [[ "$mode" == "--recover-latest" ]]; then
  phase "assume approved ${VERIFIER_ROLE} role to locate the newest exercise version"
  use_role VERIFIER
  latest_versions="$(run_aws verifier-list-exercise-versions --region "$REGION" s3api list-object-versions --bucket "$PRIMARY_BUCKET" --prefix 'raw/legal-hold-exercises/' --output json)"
  newest="$(jq -cer '[.Versions[]? | select(.Key | test("^raw/legal-hold-exercises/[0-9]{4}-[0-9]{2}-[0-9]{2}/[A-Za-z0-9-]+/payload\\.txt$"))] | max_by(.LastModified)' <<<"$latest_versions")" || fail "No recoverable legal-hold exercise version was found." 65
  exercise_key="$(jq -er '.Key' <<<"$newest")"
  version_id="$(jq -er '.VersionId' <<<"$newest")"
  unset latest_versions newest
  phase "read current legal hold and compliance retention through verifier"
  recovery_hold_on="$(read_legal_hold recovery-hold-on-readback)"
  recovery_retention_before="$(read_retention recovery-retention-before-readback)"
  jq -e '.LegalHold.Status == "ON"' <<<"$recovery_hold_on" >/dev/null || fail "Newest exercise version does not have a legal hold to recover."
  retention_until="$(jq -er '.Retention.RetainUntilDate' <<<"$recovery_retention_before")" || fail "Recovery retention readback has no retention instant."
  assert_retention_readback "$recovery_retention_before"
  phase "assume approved ${BREAK_GLASS_ROLE} role to remove only the legal hold"
  use_role BREAK_GLASS
  run_aws recovery-legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null
  phase "verify legal hold OFF and compliance retention unchanged through verifier"
  use_role VERIFIER
  recovery_hold_off="$(read_legal_hold recovery-hold-off-readback)"
  recovery_retention_after="$(read_retention recovery-retention-after-readback)"
  jq -e '.LegalHold.Status == "OFF"' <<<"$recovery_hold_off" >/dev/null || fail "Legal hold recovery did not read back as OFF."
  assert_retention_readback "$recovery_retention_after"
  assert_same_retention "$recovery_retention_before" "$recovery_retention_after"
  jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retentionUntil "$retention_until" \
    '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",recoveredLatestExercise:{legalHoldBefore:"ON",legalHoldAfter:"OFF",complianceRetentionUnchanged:true,retainUntil:$retentionUntil},productionEligible:false}' > "$evidence_dir/redacted-recovery-readback.json"
  unset recovery_hold_on recovery_retention_before recovery_hold_off recovery_retention_after AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN account_id version_id exercise_key mfa_serial VERIFIER_ACCESS_KEY_ID VERIFIER_SECRET_ACCESS_KEY VERIFIER_SESSION_TOKEN BREAK_GLASS_ACCESS_KEY_ID BREAK_GLASS_SECRET_ACCESS_KEY BREAK_GLASS_SESSION_TOKEN
  printf 'Recovery completed. Redacted evidence is at: %s\n' "$evidence_dir/redacted-recovery-readback.json"
  exit 0
fi

exercise_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
exercise_key="raw/legal-hold-exercises/$(date -u +%F)/${exercise_id}/payload.txt"
payload="$evidence_dir/payload.txt"
printf 'Witness Tree Phase 1 legal-hold exercise only.\n' > "$payload"
retention_until="$(node -e 'console.log(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"))')"

use_role UPLOADER
phase "upload the tiny dedicated exercise object"
put_result="$(run_aws put-object --region "$REGION" s3api put-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --body "$payload" --checksum-algorithm SHA256 --output json)"
version_id="$(jq -er '.VersionId' <<<"$put_result")"
unset put_result

use_role BREAK_GLASS
phase "set compliance retention and legal hold ON"
run_aws put-retention --region "$REGION" s3api put-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --retention "Mode=COMPLIANCE,RetainUntilDate=${retention_until}" >/dev/null
run_aws legal-hold-on --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=ON >/dev/null
hold_cleanup_required=1
trap cleanup_legal_hold EXIT
use_role VERIFIER
phase "read legal hold ON and compliance retention through verifier"
hold_on="$(read_legal_hold legal-hold-on-readback)"
retention_on="$(read_retention retention-on-readback)"
printf '%s\n' "$hold_on" >"$evidence_dir/legal-hold-on-readback.json"
printf '%s\n' "$retention_on" >"$evidence_dir/retention-on-readback.json"
jq -e '.LegalHold.Status == "ON"' <<<"$hold_on" >/dev/null
assert_retention_readback "$retention_on"
use_role BREAK_GLASS
phase "set legal hold OFF"
run_aws legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null
use_role VERIFIER
phase "verify legal hold OFF and unchanged compliance retention through verifier"
hold_off="$(read_legal_hold legal-hold-off-readback)"
retention_off="$(read_retention retention-off-readback)"
printf '%s\n' "$hold_off" >"$evidence_dir/legal-hold-off-readback.json"
printf '%s\n' "$retention_off" >"$evidence_dir/retention-off-readback.json"
jq -e '.LegalHold.Status == "OFF"' <<<"$hold_off" >/dev/null
assert_retention_readback "$retention_off"
hold_cleanup_required=0
trap - EXIT
unset hold_on retention_on hold_off retention_off

use_role UPLOADER
phase "confirm a version-specific delete is denied"
delete_status="unexpected-success"
if run_aws delete-probe --region "$REGION" s3api delete-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json >"$evidence_dir/delete-probe.stdout"; then fail "Safety failure: uploader version-specific delete unexpectedly succeeded." 70; else delete_status="denied-as-required"; fi

use_role VERIFIER
phase "record CloudTrail query as outside the verifier role; do not broaden it"
cloudtrail_status="not-queryable-by-verifier-role"
recovery_status="replica-readback-pending"
for attempt in 1 2 3 4 5 6; do
  phase "bounded recovery-replica readback ${attempt}/6"
  if run_aws recovery --region "$REGION" s3api head-object --bucket "$RECOVERY_BUCKET" --key "$exercise_key" --output json >"$evidence_dir/recovery.stdout"; then recovery_status="replica-readback-authorized"; break; fi
  sleep 10
done

jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retentionUntil "$retention_until" --arg delete "$delete_status" --arg cloudtrail "$cloudtrail_status" --arg recovery "$recovery_status" \
  '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",legalHold:{onReadback:"ON",offReadback:"OFF",complianceRetentionUnchanged:true,retainUntil:$retentionUntil},deniedVersionDeleteProbe:$delete,cloudTrail:$cloudtrail,recoveryReplication:$recovery,completed:($recovery == "replica-readback-authorized"),productionEligible:false}' > "$evidence"
node "$SCRIPT_DIR/check-phase1-archive-exercise-readback.mjs" "$evidence" >/dev/null
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN account_id version_id mfa_serial \
  UPLOADER_ACCESS_KEY_ID UPLOADER_SECRET_ACCESS_KEY UPLOADER_SESSION_TOKEN \
  BREAK_GLASS_ACCESS_KEY_ID BREAK_GLASS_SECRET_ACCESS_KEY BREAK_GLASS_SESSION_TOKEN \
  VERIFIER_ACCESS_KEY_ID VERIFIER_SECRET_ACCESS_KEY VERIFIER_SESSION_TOKEN
[[ "$recovery_status" == "replica-readback-authorized" ]] || fail "Recovery replica did not read back within the bounded window; inspect the redacted evidence and do not count this exercise complete." 75
printf 'Exercise completed. Redacted evidence is at: %s\n' "$evidence"
printf 'CloudTrail lookup is deliberately outside the verifier role; do not use root to bypass that boundary.\n'
