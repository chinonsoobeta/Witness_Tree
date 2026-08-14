#!/usr/bin/env bash
# Owner-local Phase 1 archive control exercise. Do not run with root credentials.
set -euo pipefail
umask 077

PROFILE="WitnessTreeArchiveOperator"
REGION="ca-central-1"
PRIMARY_BUCKET="witness-tree-raw-archive-ca-central-1"
RECOVERY_BUCKET="witness-tree-raw-recovery-ca-central-1"
TRAIL="witness-tree-archive-object-audit-ca-central-1"
UPLOADER_ROLE="WitnessTreeArchiveUploader"
BREAK_GLASS_ROLE="WitnessTreeArchiveRetentionBreakGlass"

usage() {
  cat <<'EOF'
Usage: scripts/run-phase1-archive-owner-exercise.sh --run [--profile WitnessTreeArchiveOperator]

This owner-local command securely prompts for the current virtual-MFA TOTP. It never
prints or writes the TOTP, access-key secret, STS credentials, account ID, ARNs, or
object version ID. It creates one tiny dedicated legal-hold exercise object, verifies
hold ON/readback/OFF/readback and unchanged compliance retention, and requires the
uploader-role version-specific delete to be denied.

It also attempts the configured CloudTrail and recovery readbacks. The approved roles
do not have broad audit or recovery-read permissions, so an AccessDenied result is
recorded as a least-privilege verification blocker, never bypassed with root.
EOF
}

if [[ "${1:-}" != "--run" ]]; then usage; exit 64; fi
shift
if [[ "${1:-}" == "--profile" ]]; then PROFILE="${2:?--profile requires a value}"; shift 2; fi
[[ $# -eq 0 ]] || { usage; exit 64; }

command -v aws >/dev/null || { echo "aws CLI is required." >&2; exit 69; }
command -v jq >/dev/null || { echo "jq is required." >&2; exit 69; }

evidence_dir="$(mktemp -d /private/tmp/witness-tree-archive-exercise.XXXXXX)"
chmod 700 "$evidence_dir"
evidence="$evidence_dir/redacted-readback.json"
# AWS errors can include principal identifiers. Preserve them locally for the owner,
# but never print them to Terminal or a chat transcript.
exec 2>"$evidence_dir/private.stderr"

identity="$(aws --profile "$PROFILE" sts get-caller-identity --output json)"
account_id="$(jq -er '.Account | select(test("^[0-9]{12}$"))' <<<"$identity")"
principal_arn="$(jq -er '.Arn | select(endswith(":user/WitnessTreeArchiveOperator"))' <<<"$identity")"
unset identity

mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
if [[ -z "$mfa_serial" ]]; then mfa_serial="arn:aws:iam::${account_id}:mfa/WitnessTreeArchiveOperator"; fi

read -r -s -p "Current WitnessTreeArchiveOperator TOTP (not saved): " totp
printf '\n'
[[ "$totp" =~ ^[0-9]{6,8}$ ]] || { echo "TOTP must contain 6–8 digits." >&2; exit 64; }

bootstrap="$(aws --profile "$PROFILE" sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --duration-seconds 3600 --output json)"
unset totp mfa_serial
BOOTSTRAP_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$bootstrap")"
BOOTSTRAP_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$bootstrap")"
BOOTSTRAP_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$bootstrap")"
unset bootstrap account_id principal_arn

assume_role() {
  local role="$1" response
  response="$(AWS_ACCESS_KEY_ID="$BOOTSTRAP_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BOOTSTRAP_SECRET_ACCESS_KEY" AWS_SESSION_TOKEN="$BOOTSTRAP_SESSION_TOKEN" \
    aws sts assume-role --role-arn "arn:aws:iam::${verified_account}:role/${role}" --role-session-name "WitnessTreeArchiveExercise-$(date -u +%Y%m%dT%H%M%SZ)" --duration-seconds 3600 --output json)"
  export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId' <<<"$response")"
  export AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey' <<<"$response")"
  export AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken' <<<"$response")"
  unset response
}

# Re-read only the account ID internally after the TOTP boundary; never emit it.
verified_account="$(aws --profile "$PROFILE" sts get-caller-identity --query Account --output text)"
[[ "$verified_account" =~ ^[0-9]{12}$ ]] || { echo "Verified account is invalid." >&2; exit 65; }

exercise_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
exercise_key="raw/legal-hold-exercises/$(date -u +%F)/${exercise_id}/payload.txt"
payload="$evidence_dir/payload.txt"
printf 'Witness Tree Phase 1 legal-hold exercise only.\n' > "$payload"
retention_until="$(node -e 'console.log(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"))')"

assume_role "$UPLOADER_ROLE"
put_result="$(aws --region "$REGION" s3api put-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --body "$payload" --checksum-algorithm SHA256 --output json)"
version_id="$(jq -er '.VersionId' <<<"$put_result")"
unset put_result

assume_role "$BREAK_GLASS_ROLE"
aws --region "$REGION" s3api put-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --retention "Mode=COMPLIANCE,RetainUntilDate=${retention_until}"
aws --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=ON
hold_on="$(aws --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
retention_on="$(aws --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
jq -e '.LegalHold.Status == "ON"' <<<"$hold_on" >/dev/null
jq -e --arg until "$retention_until" '.Retention.Mode == "COMPLIANCE" and .Retention.RetainUntilDate == $until' <<<"$retention_on" >/dev/null
aws --region "$REGION" s3api put-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --legal-hold Status=OFF
hold_off="$(aws --region "$REGION" s3api get-object-legal-hold --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
retention_off="$(aws --region "$REGION" s3api get-object-retention --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json)"
jq -e '.LegalHold.Status == "OFF"' <<<"$hold_off" >/dev/null
jq -e --arg until "$retention_until" '.Retention.Mode == "COMPLIANCE" and .Retention.RetainUntilDate == $until' <<<"$retention_off" >/dev/null
unset hold_on retention_on hold_off retention_off

# The retained object makes this probe safe even if a policy was accidentally changed.
assume_role "$UPLOADER_ROLE"
delete_status="unexpected-success"
if aws --region "$REGION" s3api delete-object --bucket "$PRIMARY_BUCKET" --key "$exercise_key" --version-id "$version_id" --output json >"$evidence_dir/delete-probe.stdout" 2>"$evidence_dir/delete-probe.stderr"; then
  echo "Safety failure: uploader version-specific delete unexpectedly succeeded." >&2
  exit 70
else
  delete_status="denied-as-required"
fi

cloudtrail_status="not-attempted"
if aws --region "$REGION" cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject --max-results 1 --output json >"$evidence_dir/cloudtrail.stdout" 2>"$evidence_dir/cloudtrail.stderr"; then cloudtrail_status="delivery-query-authorized"; else cloudtrail_status="not-verifiable-with-approved-role"; fi
recovery_status="not-attempted"
for _ in 1 2 3 4 5 6; do
  if aws --region "$REGION" s3api head-object --bucket "$RECOVERY_BUCKET" --key "$exercise_key" --output json >"$evidence_dir/recovery.stdout" 2>"$evidence_dir/recovery.stderr"; then recovery_status="replica-readback-authorized"; break; fi
  sleep 10
done
if [[ "$recovery_status" == "not-attempted" ]]; then recovery_status="not-verifiable-with-approved-role"; fi

jq -n --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg retentionUntil "$retention_until" --arg delete "$delete_status" --arg cloudtrail "$cloudtrail_status" --arg recovery "$recovery_status" \
  '{schemaVersion:1,capturedAt:$capturedAt,identity:"mfa-temporary-session-verified; identifiers omitted",legalHold:{onReadback:"ON",offReadback:"OFF",complianceRetentionUnchanged:true,retainUntil:$retentionUntil},deniedVersionDeleteProbe:$delete,cloudTrail:$cloudtrail,recoveryReplication:$recovery,productionEligible:false}' > "$evidence"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN BOOTSTRAP_ACCESS_KEY_ID BOOTSTRAP_SECRET_ACCESS_KEY BOOTSTRAP_SESSION_TOKEN verified_account version_id
echo "Exercise completed. Redacted evidence is at: $evidence"
echo "CloudTrail/recovery statuses may require a separately approved read-only verifier; do not use root to bypass them."
