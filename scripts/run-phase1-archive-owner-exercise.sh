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
CLI_CONNECT_TIMEOUT=10
CLI_READ_TIMEOUT=30

usage() {
  cat <<'EOF'
Usage: scripts/run-phase1-archive-owner-exercise.sh --run [--profile WitnessTreeArchiveOperator]

This owner-local command securely prompts for the current virtual-MFA TOTP. It never
prints or writes the TOTP, access-key secret, STS credentials, account ID, ARNs, or
object version ID. AWS diagnostics are retained locally in a 0700 temporary directory.
EOF
}
phase() { printf 'Phase: %s\n' "$1"; }
fail() { printf 'Stopped: %s\n' "$1" >&2; exit "${2:-1}"; }

if [[ "${1:-}" != "--run" ]]; then usage; exit 64; fi
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
cleanup_legal_hold() {
  local status=$?
  if [[ "${hold_cleanup_required:-0}" == 1 ]]; then
    phase "best-effort cleanup: set the exercise legal hold OFF"
    run_aws cleanup-legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null || true
  fi
  exit "$status"
}

# Prompt before any AWS call, so invalid/empty input cannot mutate AWS state.
phase "enter the current virtual-MFA TOTP; it is not saved"
read -r -s -p "Current WitnessTreeArchiveOperator TOTP (not saved): " totp
printf '\n'
[[ "$totp" =~ ^[0-9]{6,8}$ ]] || fail "TOTP must contain 6–8 digits." 64

phase "verify the configured no-console operator identity"
identity="$(run_aws identity --profile "$PROFILE" sts get-caller-identity --output json)"
account_id="$(jq -er '.Account | select(test("^[0-9]{12}$"))' <<<"$identity")"
jq -er '.Arn | select(endswith(":user/WitnessTreeArchiveOperator"))' <<<"$identity" >/dev/null
unset identity
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>"$evidence_dir/mfa-serial.stderr" || true)"
[[ "$mfa_serial" == arn:aws:iam::*:mfa/* ]] || fail "Set this profile's exact assigned virtual-MFA serial locally, then retry."

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
phase "set compliance retention and legal hold ON, then read both"
run_aws put-retention --region "$REGION" s3api put-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --retention "Mode=COMPLIANCE,RetainUntilDate=${retention_until}" >/dev/null
run_aws legal-hold-on --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=ON >/dev/null
hold_cleanup_required=1
trap cleanup_legal_hold EXIT
hold_on="$(run_aws legal-hold-on-readback --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
retention_on="$(run_aws retention-on-readback --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
printf '%s\n' "$hold_on" >"$evidence_dir/legal-hold-on-readback.json"
printf '%s\n' "$retention_on" >"$evidence_dir/retention-on-readback.json"
jq -e '.LegalHold.Status == "ON"' <<<"$hold_on" >/dev/null
assert_retention_readback "$retention_on"
phase "set legal hold OFF and verify unchanged compliance retention"
run_aws legal-hold-off --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF >/dev/null
hold_off="$(run_aws legal-hold-off-readback --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
retention_off="$(run_aws retention-off-readback --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
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

phase "attempt bounded CloudTrail and recovery readbacks"
cloudtrail_status="not-verifiable-with-approved-role"
if run_aws cloudtrail --region "$REGION" cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject --max-results 1 --output json >"$evidence_dir/cloudtrail.stdout"; then cloudtrail_status="delivery-query-authorized"; fi
recovery_status="not-verifiable-with-approved-role"
for _ in 1 2 3 4 5 6; do
  if run_aws recovery --region "$REGION" s3api head-object --bucket "$RECOVERY_BUCKET" --key "$exercise_key" --output json >"$evidence_dir/recovery.stdout"; then recovery_status="replica-readback-authorized"; break; fi
  sleep 10
done

jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retentionUntil "$retention_until" --arg delete "$delete_status" --arg cloudtrail "$cloudtrail_status" --arg recovery "$recovery_status" \
  '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",legalHold:{onReadback:"ON",offReadback:"OFF",complianceRetentionUnchanged:true,retainUntil:$retentionUntil},deniedVersionDeleteProbe:$delete,cloudTrail:$cloudtrail,recoveryReplication:$recovery,productionEligible:false}' > "$evidence"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN account_id version_id
printf 'Exercise completed. Redacted evidence is at: %s\n' "$evidence"
printf 'CloudTrail/recovery may require a separately approved read-only verifier; do not use root to bypass them.\n'
