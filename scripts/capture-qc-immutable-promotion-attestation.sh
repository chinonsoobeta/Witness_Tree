#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

# Owner-local, read-only post-run capture. It never uploads, changes retention,
# deletes, or reads any object other than the four exact completed versions.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeQcArchivePromotionUploader"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/qc-immutable-promotion-preparation.json"
STATE_ROOT="/private/tmp/witness-tree-qc-archive-promotion-state"
TMP=""

cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds identity mfa_serial totp; [[ -n "$TMP" && -d "$TMP" ]] && rm -rf "$TMP"; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

[[ $# -eq 3 && "$1" == "--capture" ]] || fail "Usage: $0 --capture <new-mode-600-private-attestation> <new-redacted-public-record>" 64
PRIVATE_OUTPUT="$2"; PUBLIC_OUTPUT="$3"
[[ ! -e "$PRIVATE_OUTPUT" && ! -L "$PRIVATE_OUTPUT" && ! -e "$PUBLIC_OUTPUT" && ! -L "$PUBLIC_OUTPUT" ]] || fail "Output paths must be new; no TOTP or AWS call was made" 65
for tool in node jq shasum stat aws; do need "$tool"; done
node "$ROOT/scripts/prepare-qc-immutable-promotion.mjs" >/dev/null
[[ -d "$STATE_ROOT" && ! -L "$STATE_ROOT" && -O "$STATE_ROOT" && "$(stat -f %Lp "$STATE_ROOT")" == 700 ]] || fail "Private promotion state root must be an owner-owned non-symlink mode-700 directory; no TOTP or AWS call was made" 65

TMP="$(mktemp -d /private/tmp/witness-tree-qc-attestation-capture.XXXXXX)"; chmod 700 "$TMP"
while IFS= read -r artifact; do
  id="$(jq -r '.id' <<<"$artifact")"; sha="$(jq -r '.sha256' <<<"$artifact")"; state="$STATE_ROOT/${id}-${sha}/state.json"
  [[ -f "$state" && ! -L "$state" && -O "$state" && "$(stat -f %Lp "$state")" == 600 ]] || fail "Exact completed owner state for $id must be an owner-owned non-symlink mode-600 file; no TOTP or AWS call was made" 65
  jq -e --arg id "$id" --arg sha "$sha" '.artifactId==$id and .sha256==$sha and .initiation=="accepted" and (.uploadId|type=="string" and length>0) and (.payloadVersionId|type=="string" and length>0) and (.sidecarVersionId|type=="string" and length>0) and (.compositeChecksumSha256|type=="string" and length>0)' "$state" >/dev/null || fail "Promotion state is incomplete for $id; no TOTP or AWS call was made" 65
  cp "$state" "$TMP/${id}.state.json"; chmod 600 "$TMP/${id}.state.json"
done < <(jq -c '.artifacts[]' "$PLAN")

[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
read -r -s 'totp?Current MFA TOTP (not stored): '; print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is absent, malformed, or outside the approved account; no STS or storage call was made" 69
operator_identity='{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}'
creds="$(wt_assume_direct_mfa_role "$PROFILE" 286853118812 "$ROLE" witness-tree-qc-attestation-readback)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"; unset creds

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -n --arg createdAt "$created_at" --argjson identity "$operator_identity" '{createdAt:$createdAt,identity:$identity}' > "$TMP/meta.json"; chmod 600 "$TMP/meta.json"; unset identity operator_identity
while IFS= read -r artifact; do
  id="$(jq -r '.id' <<<"$artifact")"; payload="$(jq -r '.payloadKey' <<<"$artifact")"; manifest="$(jq -r '.manifestKey' <<<"$artifact")"; state="$TMP/${id}.state.json"
  payload_version="$(jq -r '.payloadVersionId' "$state")"; manifest_version="$(jq -r '.sidecarVersionId' "$state")"
  if ! aws s3api head-object --bucket "$BUCKET" --key "$payload" --version-id "$payload_version" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/${id}.payload-head.raw.json" 2>"$TMP/${id}.payload-head.stderr"; then
    fail "Payload head read failed" 77
  fi
  if ! jq --arg at "$created_at" '. + {WitnessTreeCapturedAt:$at}' "$TMP/${id}.payload-head.raw.json" >"$TMP/${id}.payload-head.json" 2>"$TMP/${id}.payload-head-jq.stderr"; then
    fail "Payload head response was invalid" 77
  fi
  if ! aws s3api head-object --bucket "$BUCKET" --key "$manifest" --version-id "$manifest_version" --checksum-mode ENABLED --region "$REGION" --output json >"$TMP/${id}.manifest-head.raw.json" 2>"$TMP/${id}.manifest-head.stderr"; then
    fail "Manifest head read failed" 77
  fi
  if ! jq --arg at "$created_at" '. + {WitnessTreeCapturedAt:$at}' "$TMP/${id}.manifest-head.raw.json" >"$TMP/${id}.manifest-head.json" 2>"$TMP/${id}.manifest-head-jq.stderr"; then
    fail "Manifest head response was invalid" 77
  fi
  if ! aws s3api get-object-retention --bucket "$BUCKET" --key "$payload" --version-id "$payload_version" --region "$REGION" --output json >"$TMP/${id}.retention.raw.json" 2>"$TMP/${id}.retention.stderr"; then
    fail "Payload retention read failed" 77
  fi
  if ! jq --arg at "$created_at" '. + {WitnessTreeCapturedAt:$at}' "$TMP/${id}.retention.raw.json" >"$TMP/${id}.retention.json" 2>"$TMP/${id}.retention-jq.stderr"; then
    fail "Payload retention response was invalid" 77
  fi
  chmod 600 "$TMP/${id}.payload-head.json" "$TMP/${id}.manifest-head.json" "$TMP/${id}.retention.json"
done < <(jq -c '.artifacts[]' "$PLAN")

if ! node "$ROOT/scripts/assemble-qc-immutable-promotion-attestation.mjs" "$ROOT" "$TMP" "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT" >"$TMP/assembler.stdout" 2>"$TMP/assembler.stderr"; then
  fail "Attestation assembly failed; no output was accepted" 77
fi
if ! node "$ROOT/scripts/check-qc-immutable-promotion-attestation.mjs" --pair "$PRIVATE_OUTPUT" "$PUBLIC_OUTPUT" >"$TMP/checker.stdout" 2>"$TMP/checker.stderr"; then
  fail "Attestation pair validation failed; no output was accepted" 77
fi
print -- "Read-only post-run capture passed. Preserve the private mode-600 file outside Git and hand off only its SHA-256 plus the redacted public record for canonical review."
