#!/bin/zsh
# Read-only diagnosis of the 403 that stops
# scripts/restore-federal-electoral-archive-reproduction-inputs.sh.
#
# It assumes the role ONCE, so a single TOTP answers every question, then runs
# a series of probes that differ by exactly one variable each. Every call is
# read-only: get-caller-identity, head-object, list-object-versions and
# get-bucket-encryption. There is no put, no retention call, no legal hold, no
# delete, and nothing is downloaded. A probe that fails is recorded and the run
# continues, because the pattern of which probes fail is the diagnosis.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="${WT_REPRO_ROLE:-WitnessTreeArchivePromotionUploader}"
ACCOUNT="286853118812"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="$ROOT/data/federal-electoral-archive-recovery-evidence.json"

cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN creds; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

[[ $# -eq 1 && "$1" == "--diagnose" ]] || fail "Use only: $0 --diagnose" 64
for tool in aws jq; do need "$tool"; done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
[[ -r "$EVIDENCE" ]] || fail "Archive recovery evidence is unreadable; no AWS call was made" 66

payload_key="$(jq -er '.physicalArtifact.payloadKey' <"$EVIDENCE")" || fail "Evidence has no payload key" 66
payload_version="$(jq -er '.payload.versionId' <"$EVIDENCE")" || fail "Evidence has no payload versionId" 66

TMP="$(mktemp -d /private/tmp/witness-tree-diag-XXXXXX)"
RESULTS="$TMP/probes.json"
print -- '[]' >"$RESULTS"

creds="$(wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-archive-read-diagnosis)" \
  || fail "Direct MFA role assumption failed; no archive call was made" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" \
       AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" \
       AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"
unset creds

# Runs one probe, records its exit status and AWS error code, never aborts.
probe() {
  local id question rc err code out
  id="$1"; question="$2"; shift 2
  set +e
  out="$("$@" 2>"$TMP/$id.err")"
  rc=$?
  set -e
  err="$(cat "$TMP/$id.err")"
  code="$(print -r -- "$err" | sed -n 's/.*An error occurred (\([A-Za-z0-9]*\)).*/\1/p' | head -1)"
  [[ -n "$code" ]] || { [[ $rc -eq 0 ]] && code="ok" || code="unknown"; }
  print -r -- "$out" >"$TMP/$id.out"
  jq --arg id "$id" --arg q "$question" --argjson s "$rc" --arg c "$code" \
    '. + [{probe: $id, question: $q, exitStatus: $s, awsErrorCode: $c}]' \
    "$RESULTS" >"$RESULTS.next" && mv "$RESULTS.next" "$RESULTS"
  printf '  %-34s %-8s %s\n' "$id" "$([[ $rc -eq 0 ]] && print ok || print FAILED)" "$code"
}

print -- "Probes (all read-only, one role session):"
probe identity "Which principal are we actually using?" \
  aws sts get-caller-identity --output json
probe head-version-no-checksum "Does the exact version head without --checksum-mode?" \
  aws s3api head-object --bucket "$BUCKET" --key "$payload_key" --version-id "$payload_version" --region "$REGION" --output json
probe head-version-with-checksum "Does the same head succeed with --checksum-mode ENABLED?" \
  aws s3api head-object --bucket "$BUCKET" --key "$payload_key" --version-id "$payload_version" --checksum-mode ENABLED --region "$REGION" --output json
probe head-current-no-version "Does the current version head without --version-id?" \
  aws s3api head-object --bucket "$BUCKET" --key "$payload_key" --region "$REGION" --output json
probe list-versions "Can we list versions of that exact key?" \
  aws s3api list-object-versions --bucket "$BUCKET" --prefix "$payload_key" --max-items 5 --region "$REGION" --output json
probe bucket-encryption "Is the bucket encrypted with a customer managed KMS key?" \
  aws s3api get-bucket-encryption --bucket "$BUCKET" --region "$REGION" --output json

jq -n --argjson probes "$(cat "$RESULTS")" --arg role "$ROLE" --arg key "$payload_key" --arg version "$payload_version" \
  '{
     schemaVersion: "witness-tree/archive-read-access-diagnosis/1",
     operation: "read-only-access-diagnosis",
     awsOperations: ["sts get-caller-identity", "s3api head-object", "s3api list-object-versions", "s3api get-bucket-encryption"],
     roleName: $role, key: $key, versionId: $version, probes: $probes
   }' >"$TMP/diagnosis.json"

print
print -- "Nothing was mutated and nothing was downloaded."
print -- "Diagnosis: $TMP/diagnosis.json"
print -- "Raw stderr per probe: $TMP/<probe>.err"
