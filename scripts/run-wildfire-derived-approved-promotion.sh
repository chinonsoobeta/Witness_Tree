#!/bin/zsh
# Owner-local only. The exact role, keys, artifacts and retention were approved.
set -euo pipefail
umask 077
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeWildfireDerivedPromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ROOT="/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data"
TMP=""
cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds totp
  [[ -n "$TMP" && -d "$TMP" && "$TMP" == /private/tmp/witness-tree-wildfire-derived-promotion.* ]] && rm -rf -- "$TMP"
}
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
[[ $# -le 1 && ( $# -eq 0 || "$1" == "--preflight" || "$1" == "--run" ) ]] || fail "Usage: $0 [--preflight|--run]" 64
node "$ROOT/scripts/prepare-wildfire-derived-immutable-promotion.mjs" >/dev/null
typeset -a IDS FILES BYTES SHAS PAYLOADS SIDECARS
IDS=(bc-wildfire-216-feature-derived-2026-08-14 ontario-in-year-fire-188-feature-derived-2026-08-14)
FILES=("$DATA_ROOT/derived/bc-wildfire-geometry-policy-v1/2026-08-14/bc-wildfire-216-feature-release.gpkg" "$DATA_ROOT/derived/ontario-in-year-fire-geometry-policy-v1/2026-08-14/ontario-in-year-fire-perimeters-188-feature-derived.gpkg")
BYTES=(2162688 7913472)
SHAS=(8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce 5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31)
PAYLOADS=(derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/payload/bc-wildfire-216-feature-release.gpkg derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/payload/ontario-in-year-fire-perimeters-188-feature-derived.gpkg)
SIDECARS=(derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/manifest.json derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/manifest.json)
for i in {1..2}; do [[ -f "${FILES[$i]}" && "$(stat -f %z "${FILES[$i]}")" == "${BYTES[$i]}" && "$(shasum -a 256 "${FILES[$i]}" | awk '{print $1}')" == "${SHAS[$i]}" ]] || fail "Approved derived artifact drifted or is missing; no TOTP or AWS call was made" 65; done
print -- "PRECHECK passed: exact BC 216-feature and Ontario 188-feature derived artifacts are local; no TOTP or AWS call was made."
[[ "${1:-}" == "--run" ]] || exit 0
command -v aws >/dev/null || fail "aws CLI is required" 69
command -v jq >/dev/null || fail "jq is required" 69
command -v rg >/dev/null || fail "rg is required" 69
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE")" || fail "Cannot read local configured MFA serial" 69
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent or outside the approved account; no STS or storage call was made" 69
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
print -- "Phase: obtain a short-lived MFA session"
bootstrap="$(aws sts get-session-token --serial-number "$mfa_serial" --token-code "$totp" --profile "$PROFILE" --duration-seconds 3600 --output json)" || fail "MFA session failed" 77
unset totp mfa_serial
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId // empty' <<<"$bootstrap")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey // empty' <<<"$bootstrap")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken // empty' <<<"$bootstrap")"
[[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" && -n "$AWS_SESSION_TOKEN" ]] || fail "MFA session response lacked credentials" 77
unset bootstrap
account="$(aws sts get-caller-identity --query Account --output text)" || fail "Cannot identify MFA session" 77
caller="$(aws sts get-caller-identity --query Arn --output text)" || fail "Cannot identify MFA principal" 77
[[ "$account" == "286853118812" && "$caller" == "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" ]] || fail "MFA session is not the approved operator" 77
print -- "Phase: assume the exact derived promotion role"
creds="$(aws sts assume-role --role-arn "arn:aws:iam::${account}:role/${ROLE}" --role-session-name witness-tree-wildfire-derived-promotion --duration-seconds 3600 --output json)" || fail "Promotion role assumption failed" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId // empty' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey // empty' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken // empty' <<<"$creds")"
[[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" && -n "$AWS_SESSION_TOKEN" ]] || fail "Promotion role response lacked credentials" 77
unset creds account caller
TMP="$(mktemp -d /private/tmp/witness-tree-wildfire-derived-promotion.XXXXXX)"; chmod 700 "$TMP"
node "$ROOT/scripts/prepare-wildfire-derived-immutable-promotion.mjs" --write-sidecars "$TMP" >/dev/null
evidence='[]'
for i in {1..2}; do
  print -- "Uploading approved derived payload $i/2 by direct PutObject; wait for acknowledgement."
  payload_put="$(aws s3api put-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --body "${FILES[$i]}" --checksum-algorithm CRC64NVME --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 0 --output json)" || fail "Payload upload failed" 70
  version="$(jq -r '.VersionId // empty' <<<"$payload_put")"; put_crc="$(jq -r '.ChecksumCRC64NVME // empty' <<<"$payload_put")"
  [[ -n "$version" && -n "$put_crc" ]] || fail "Payload upload acknowledgement incomplete" 70
  payload_head="$(aws s3api head-object --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 30 --output json)" || fail "Payload exact-version read-back failed" 70
  jq -e --arg v "$version" --arg crc "$put_crc" --argjson n "${BYTES[$i]}" '.VersionId==$v and .ContentLength==$n and .ChecksumType=="FULL_OBJECT" and .ChecksumCRC64NVME==$crc' <<<"$payload_head" >/dev/null || fail "Payload read-back lacks exact version, bytes, or FULL_OBJECT CRC64NVME" 70
  aws s3api put-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 30 >/dev/null || fail "Payload COMPLIANCE retention failed" 70
  retention="$(aws s3api get-object-retention --bucket "$BUCKET" --key "${PAYLOADS[$i]}" --version-id "$version" --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 30 --output json)" || fail "Retention read-back failed" 70
  retain_read="$(jq -r '.Retention.RetainUntilDate // empty' <<<"$retention")"
  [[ "$(node -e 'const [a,b]=process.argv.slice(1).map(Date.parse);process.stdout.write(String(Number.isFinite(a)&&a===b))' "$retain_read" "$RETAIN_UNTIL")" == "true" && "$(jq -r '.Retention.Mode // empty' <<<"$retention")" == "COMPLIANCE" ]] || fail "Payload retention read-back mismatch" 70
  sidecar_file="$TMP/${IDS[$i]}.manifest.json"; sidecar_bytes="$(stat -f %z "$sidecar_file")"
  sidecar_put="$(aws s3api put-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --body "$sidecar_file" --checksum-algorithm CRC64NVME --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 0 --output json)" || fail "Sidecar upload failed" 70
  sidecar_version="$(jq -r '.VersionId // empty' <<<"$sidecar_put")"; sidecar_crc="$(jq -r '.ChecksumCRC64NVME // empty' <<<"$sidecar_put")"
  [[ -n "$sidecar_version" && -n "$sidecar_crc" ]] || fail "Sidecar upload acknowledgement incomplete" 70
  sidecar_head="$(aws s3api head-object --bucket "$BUCKET" --key "${SIDECARS[$i]}" --version-id "$sidecar_version" --checksum-mode ENABLED --region "$REGION" --cli-connect-timeout 10 --cli-read-timeout 30 --output json)" || fail "Sidecar exact-version read-back failed" 70
  jq -e --arg v "$sidecar_version" --arg crc "$sidecar_crc" --argjson n "$sidecar_bytes" '.VersionId==$v and .ContentLength==$n and .ChecksumType=="FULL_OBJECT" and .ChecksumCRC64NVME==$crc' <<<"$sidecar_head" >/dev/null || fail "Sidecar read-back lacks exact version, bytes, or FULL_OBJECT CRC64NVME" 70
  evidence="$(jq --arg id "${IDS[$i]}" --arg until "$RETAIN_UNTIL" '. + [{id:$id,payload:{versionPresent:true,exactBytes:true,fullObjectChecksumVerified:true,complianceRetention:{mode:"COMPLIANCE",retainUntil:$until}},sidecar:{versionPresent:true,exactBytes:true,fullObjectChecksumVerified:true}}]' <<<"$evidence")"
done
evidence_path="$(mktemp /private/tmp/witness-tree-wildfire-derived-redacted-readback.XXXXXX.json)"
jq -n --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson objects "$evidence" '{schemaVersion:"witness-tree/wildfire-derived-redacted-readback/1",completed:true,completedAt:$completedAt,region:"ca-central-1",objects:$objects,ownerAdmission:false,productionEligible:false}' >"$evidence_path"
chmod 600 "$evidence_path"
print -- "Derived archive promotion completed; redacted evidence: $evidence_path"
print -- "This is immutable archive evidence only. Production activation remains subject to the six-object admission gate."
