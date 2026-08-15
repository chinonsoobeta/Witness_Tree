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
    assume_role "$BREAK_GLASS_ROLE" || true
    run_aws cleanup-legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null || true
  fi
  exit "$status"
}

# Prompt before any AWS call on a mutating or recovery run, so invalid/empty input
# cannot reach AWS. Preflight is intentionally the sole no-TOTP read-only path.
if [[ "$mode" != "--preflight" ]]; then
  phase "enter the current virtual-MFA TOTP; it is not saved"
  read -r -s -p "Current WitnessTreeArchiveOperator TOTP (not saved): " totp
  printf '\n'
  [[ "$totp" =~ ^[0-9]{6,8}$ ]] || fail "TOTP must contain 6–8 digits." 64
fi

phase "verify the configured no-console operator identity"
identity="$(run_aws identity --profile "$PROFILE" sts get-caller-identity --output json)"
account_id="$(jq -er '.Account | select(test("^[0-9]{12}$"))' <<<"$identity")"
[[ "$account_id" == "286853118812" ]] || fail "Configured profile is outside the approved account."
jq -er --arg account "$account_id" '.Arn == ("arn:aws:iam::" + $account + ":user/WitnessTreeArchiveOperator")' <<<"$identity" >/dev/null || fail "Configured profile must authenticate as WitnessTreeArchiveOperator."
unset identity
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>"$evidence_dir/mfa-serial.stderr" || true)"
[[ "$mfa_serial" =~ ^arn:aws:iam::${account_id}:mfa/[A-Za-z0-9+=,.@_/-]+$ ]] || fail "Set this profile's exact account-scoped virtual-MFA serial locally, then retry."
[[ "$mode" == "--preflight" ]] && { printf 'PRECHECK passed: configured profile identity and account-scoped MFA serial match; no TOTP was requested and no AWS mutation was attempted.\n'; exit 0; }

phase "obtain a short-lived MFA session"
bootstrap="$(run_aws get-session-token --profile "$PROFILE" sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --duration-seconds 3600 --output json)"
unset totp mfa_serial
BOOTSTRAP_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")"
BOOTSTRAP_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")"
BOOTSTRAP_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"
unset bootstrap

assume_role() {
  local role="$1" response
  phase "assume approved ${role} role"
  response="$(AWS_ACCESS_KEY_ID="$BOOTSTRAP_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BOOTSTRAP_SECRET_ACCESS_KEY" AWS_SESSION_TOKEN="$BOOTSTRAP_SESSION_TOKEN" \
    run_aws "assume-${role}" sts assume-role --role-arn "arn:aws:iam::${account_id}:role/${role}" --role-session-name "WitnessTreeArchiveExercise-$(date -u +%Y%m%dT%H%M%SZ)" --duration-seconds 3600 --output json)"
  export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$response")"
  export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$response")"
  export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$response")"
  unset response
}

read_legal_hold() {
  run_aws "$1" --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json
}
read_retention() {
  run_aws "$1" --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json
}

if [[ "$mode" == "--recover-latest" ]]; then
  phase "assume approved ${VERIFIER_ROLE} role to locate the newest exercise version"
  assume_role "$VERIFIER_ROLE"
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
  assume_role "$BREAK_GLASS_ROLE"
  run_aws recovery-legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null
  phase "verify legal hold OFF and compliance retention unchanged through verifier"
  assume_role "$VERIFIER_ROLE"
  recovery_hold_off="$(read_legal_hold recovery-hold-off-readback)"
  recovery_retention_after="$(read_retention recovery-retention-after-readback)"
  jq -e '.LegalHold.Status == "OFF"' <<<"$recovery_hold_off" >/dev/null || fail "Legal hold recovery did not read back as OFF."
  assert_retention_readback "$recovery_retention_after"
  assert_same_retention "$recovery_retention_before" "$recovery_retention_after"
  jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retentionUntil "$retention_until" \
    '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",recoveredLatestExercise:{legalHoldBefore:"ON",legalHoldAfter:"OFF",complianceRetentionUnchanged:true,retainUntil:$retentionUntil},productionEligible:false}' > "$evidence_dir/redacted-recovery-readback.json"
  unset recovery_hold_on recovery_retention_before recovery_hold_off recovery_retention_after AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN account_id version_id exercise_key
  printf 'Recovery completed. Redacted evidence is at: %s\n' "$evidence_dir/redacted-recovery-readback.json"
  exit 0
fi

exercise_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
exercise_key="raw/legal-hold-exercises/$(date -u +%F)/${exercise_id}/payload.txt"
payload="$evidence_dir/payload.txt"
printf 'Witness Tree Phase 1 legal-hold exercise only.\n' > "$payload"
retention_until="$(node -e 'console.log(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"))')"

assume_role "$UPLOADER_ROLE"
phase "upload the tiny dedicated exercise object"
put_result="$(run_aws put-object --region "$REGION" s3api put-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --body "$payload" --checksum-algorithm SHA256 --output json)"
version_id="$(jq -er '.VersionId' <<<"$put_result")"
unset put_result

assume_role "$BREAK_GLASS_ROLE"
phase "set compliance retention and legal hold ON"
run_aws put-retention --region "$REGION" s3api put-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --retention "Mode=COMPLIANCE,RetainUntilDate=${retention_until}" >/dev/null
run_aws legal-hold-on --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=ON >/dev/null
hold_cleanup_required=1
trap cleanup_legal_hold EXIT
assume_role "$VERIFIER_ROLE"
phase "read legal hold ON and compliance retention through verifier"
hold_on="$(read_legal_hold legal-hold-on-readback)"
retention_on="$(read_retention retention-on-readback)"
printf '%s\n' "$hold_on" >"$evidence_dir/legal-hold-on-readback.json"
printf '%s\n' "$retention_on" >"$evidence_dir/retention-on-readback.json"
jq -e '.LegalHold.Status == "ON"' <<<"$hold_on" >/dev/null
assert_retention_readback "$retention_on"
assume_role "$BREAK_GLASS_ROLE"
phase "set legal hold OFF"
run_aws legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null
assume_role "$VERIFIER_ROLE"
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

assume_role "$UPLOADER_ROLE"
phase "confirm a version-specific delete is denied"
delete_status="unexpected-success"
if run_aws delete-probe --region "$REGION" s3api delete-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json >"$evidence_dir/delete-probe.stdout"; then fail "Safety failure: uploader version-specific delete unexpectedly succeeded." 70; else delete_status="denied-as-required"; fi

assume_role "$VERIFIER_ROLE"
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
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN account_id version_id
[[ "$recovery_status" == "replica-readback-authorized" ]] || fail "Recovery replica did not read back within the bounded window; inspect the redacted evidence and do not count this exercise complete." 75
printf 'Exercise completed. Redacted evidence is at: %s\n' "$evidence"
printf 'CloudTrail lookup is deliberately outside the verifier role; do not use root to bypass that boundary.\n'
