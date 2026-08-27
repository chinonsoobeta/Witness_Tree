#!/bin/zsh
# Read-only restoration of the two federal-electoral raw archive objects needed
# by the reproduction drill in docs/RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md,
# steps 2 through 4. Run it from an interactive owner-local terminal.
#
# Every AWS call here is read-only and version-pinned: head-object and
# get-object with an explicit --version-id. There is no put-object, no
# retention call, no legal-hold call, and no delete. Nothing in the archive is
# mutated, and no new retention commitment is made.
#
# It writes only into a fresh directory under /private/tmp and never touches
# the external data root.
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="${WT_REPRO_ROLE:-WitnessTreeArchiveVerifier}"
ACCOUNT="286853118812"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="$ROOT/data/federal-electoral-archive-recovery-evidence.json"
# The runner spells the input directory and filename this way; the S3 key is
# lowercased. The restored bytes have to land under the runner's spelling.
INPUT_RELATIVE="raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip"

cleanup() { unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN creds; }
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

[[ $# -eq 1 && "$1" == "--restore" ]] || fail "Use only: $0 --restore" 64
for tool in aws jq shasum; do need "$tool"; done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
[[ -r "$EVIDENCE" ]] || fail "Archive recovery evidence is unreadable; no AWS call was made" 66

# Every expected value is read from the checksum-bound evidence record rather
# than restated here, so this runner cannot drift away from it.
payload_key="$(jq -er '.physicalArtifact.payloadKey' <"$EVIDENCE")" || fail "Evidence has no payload key" 66
manifest_key="$(jq -er '.physicalArtifact.manifestKey' <"$EVIDENCE")" || fail "Evidence has no manifest key" 66
payload_version="$(jq -er '.payload.versionId' <"$EVIDENCE")" || fail "Evidence has no payload versionId" 66
manifest_version="$(jq -er '.manifest.versionId' <"$EVIDENCE")" || fail "Evidence has no manifest versionId" 66
payload_bytes="$(jq -er '.payload.byteLength' <"$EVIDENCE")" || fail "Evidence has no payload byteLength" 66
manifest_bytes="$(jq -er '.manifest.byteLength' <"$EVIDENCE")" || fail "Evidence has no manifest byteLength" 66
payload_sha="$(jq -er '.payload.sha256' <"$EVIDENCE")" || fail "Evidence has no payload sha256" 66
manifest_sha="$(jq -er '.manifest.sha256' <"$EVIDENCE")" || fail "Evidence has no manifest sha256" 66

WT_REPRO_ROOT="$(mktemp -d /private/tmp/witness-tree-repro-XXXXXX)/Witness_Tree-data"
mkdir -p "$WT_REPRO_ROOT/$(dirname "$INPUT_RELATIVE")"
TMP="$(dirname "$WT_REPRO_ROOT")"

creds="$(wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-archive-reproduction-restore)" \
  || fail "Direct MFA role assumption failed; no archive call was made" 77
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" \
       AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" \
       AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"
unset creds

# One exact-version head, then one exact-version get. The head is confirmed
# before anything is downloaded, so a drifted object stops the run.
restore_one() {
  local key version bytes sha label destination head
  key="$1"; version="$2"; bytes="$3"; sha="$4"; label="$5"; destination="$6"
  head="$(aws s3api head-object --bucket "$BUCKET" --key "$key" --version-id "$version" \
    --checksum-mode ENABLED --region "$REGION" --output json)" \
    || fail "Could not head the exact $label version; nothing was downloaded" 73
  jq -e --arg version "$version" --argjson bytes "$bytes" \
    '.VersionId == $version and .ContentLength == $bytes and .ChecksumType == "FULL_OBJECT"' <<<"$head" >/dev/null \
    || fail "The $label head does not match the recorded version, length, or checksum type; nothing was downloaded" 73
  aws s3api get-object --bucket "$BUCKET" --key "$key" --version-id "$version" \
    --checksum-mode ENABLED --region "$REGION" "$destination" >/dev/null \
    || fail "Could not download the exact $label version" 73
  [[ "$(shasum -a 256 "$destination" | awk '{print $1}')" == "$sha" ]] \
    || fail "Restored $label bytes do not match the recorded SHA-256" 73
  [[ "$(stat -f %z "$destination")" == "$bytes" ]] \
    || fail "Restored $label byte length does not match the recorded length" 73
  print -r -- "$head" >"$TMP/$label.head.json"
  print -- "verified $label: $bytes bytes, sha256 matches, version $version"
}

restore_one "$payload_key" "$payload_version" "$payload_bytes" "$payload_sha" payload "$WT_REPRO_ROOT/$INPUT_RELATIVE"
restore_one "$manifest_key" "$manifest_version" "$manifest_bytes" "$manifest_sha" manifest "$TMP/manifest.json"

# An observation record for the drill to fold in. It carries no credential and
# no session identity, only what was read.
jq -n --arg root "$WT_REPRO_ROOT" \
      --arg awsCli "$(aws --version 2>&1)" \
      --arg pk "$payload_key" --arg pv "$payload_version" --argjson pb "$payload_bytes" --arg ps "$payload_sha" \
      --arg mk "$manifest_key" --arg mv "$manifest_version" --argjson mb "$manifest_bytes" --arg ms "$manifest_sha" \
      --arg pcrc "$(jq -r '.ChecksumCRC64NVME // ""' <"$TMP/payload.head.json")" \
      --arg mcrc "$(jq -r '.ChecksumCRC64NVME // ""' <"$TMP/manifest.head.json")" \
      '{
        schemaVersion: "witness-tree/archive-reproduction-restore-observation/1",
        operation: "read-only-version-pinned-reproduction",
        awsOperations: ["s3api head-object", "s3api get-object"],
        tools: {awsCli: $awsCli},
        dataRoot: $root,
        restoredInputs: {
          payload: {key: $pk, versionId: $pv, byteLength: $pb, sha256: $ps, checksumCRC64NVME: $pcrc},
          manifest: {key: $mk, versionId: $mv, byteLength: $mb, sha256: $ms, checksumCRC64NVME: $mcrc}
        }
      }' >"$TMP/restore-observation.json"

print
print -- "Both objects restored and verified against the checksum-bound evidence record."
print -- "Nothing in the archive was mutated: only head-object and get-object were called."
print
print -- "WT_REPRO_ROOT=$WT_REPRO_ROOT"
print -- "Observation: $TMP/restore-observation.json"
