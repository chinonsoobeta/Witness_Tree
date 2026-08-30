#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeQcArchivePromotionUploader"
ACCOUNT="286853118812"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
ARTIFACT_ID="qc-ecoforest-map-2026-08-14"
PART_SIZE=134217728
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/qc-immutable-promotion-preparation.json"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
STATE_ROOT="/private/tmp/witness-tree-qc-archive-promotion-state"

cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds identity mfa_serial totp expected_composite
}
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

[[ $# -eq 1 && "$1" == "--check" ]] || fail "Use only the exact authorized completed-object check" 64
for tool in aws jq node; do need "$tool"; done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64

# Compute the expected AWS multipart composite SHA-256 without writing a
# checksum artifact or printing any payload identity.
expected_composite="$(node - "$PLAN" "$DATA_ROOT" "$STATE_ROOT" "$ARTIFACT_ID" "$PART_SIZE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [planPath, dataRoot, stateRoot, artifactId, rawPartSize] = process.argv.slice(2);
const partSize = Number(rawPartSize);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const artifact = plan.artifacts.find((row) => row.id === artifactId);
if (!artifact || !Number.isSafeInteger(partSize) || partSize !== 134217728) process.exit(10);
const source = path.join(dataRoot, artifact.localPath);
const sourceStat = fs.lstatSync(source);
if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size !== artifact.byteLength) process.exit(11);
const statePath = path.join(stateRoot, `${artifact.id}-${artifact.sha256}`, 'state.json');
const stateStat = fs.lstatSync(statePath);
if (!stateStat.isFile() || stateStat.isSymbolicLink() || stateStat.uid !== process.getuid() || (stateStat.mode & 0o777) !== 0o600) process.exit(12);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (state.artifactId !== artifact.id || state.payloadKey !== artifact.payloadKey || state.sha256 !== artifact.sha256 ||
    state.byteLength !== artifact.byteLength || state.partSizeBytes !== partSize || state.initiation !== 'accepted' ||
    typeof state.uploadId !== 'string' || !state.uploadId) process.exit(13);
const fd = fs.openSync(source, 'r');
const buffer = Buffer.allocUnsafe(partSize);
const digests = [];
const whole = crypto.createHash('sha256');
let offset = 0;
try {
  while (offset < artifact.byteLength) {
    const wanted = Math.min(partSize, artifact.byteLength - offset);
    let received = 0;
    while (received < wanted) {
      const count = fs.readSync(fd, buffer, received, wanted - received, offset + received);
      if (count <= 0) process.exit(14);
      received += count;
    }
    const chunk = buffer.subarray(0, wanted);
    whole.update(chunk);
    digests.push(crypto.createHash('sha256').update(chunk).digest());
    offset += wanted;
  }
} finally {
  fs.closeSync(fd);
}
if (whole.digest('hex') !== artifact.sha256) process.exit(15);
const composite = crypto.createHash('sha256').update(Buffer.concat(digests)).digest('base64');
process.stdout.write(`${composite}-${digests.length}`);
NODE
)" || fail "Local checksum or exact-state validation failed; no AWS call was made" 70
[[ -n "$expected_composite" ]] || fail "Local multipart checksum was not produced; no AWS call was made" 70

read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is not the approved account serial" 69
creds="$(wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-qc-completed-object-check)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"
unset creds

# Node performs one current-version HeadObject and, only when it receives a
# concrete version, one exact-version HeadObject. Responses remain in memory.
result="$(EXPECTED_COMPOSITE="$expected_composite" node - "$PLAN" "$STATE_ROOT" "$ARTIFACT_ID" "$BUCKET" "$REGION" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const [planPath, stateRoot, artifactId, bucket, region] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const artifact = plan.artifacts.find((row) => row.id === artifactId);
if (!artifact) process.exit(20);
const statePath = path.join(stateRoot, `${artifact.id}-${artifact.sha256}`, 'state.json');
const before = fs.readFileSync(statePath);
const env = {...process.env, AWS_MAX_ATTEMPTS: '1', AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off'};
const call = (args) => spawnSync('aws', args, {env, encoding: 'utf8', input: '', maxBuffer: 4 * 1024 * 1024});
const base = ['s3api','head-object','--bucket',bucket,'--key',artifact.payloadKey,'--checksum-mode','ENABLED','--region',region,'--output','json','--no-cli-pager'];
const first = call(base);
if (!before.equals(fs.readFileSync(statePath))) process.exit(21);
if (first.status !== 0) {
  const absent = /\((?:NoSuchKey|NotFound|404)\)|Not Found|status code: 404/i.test(first.stderr || '');
  process.stdout.write(absent ? 'absent' : 'mismatched');
  process.exit(0);
}
let current;
try { current = JSON.parse(first.stdout); } catch { process.stdout.write('mismatched'); process.exit(0); }
const version = typeof current.VersionId === 'string' && current.VersionId ? current.VersionId : null;
if (!version) { process.stdout.write('mismatched'); process.exit(0); }
const second = call([...base, '--version-id', version]);
if (!before.equals(fs.readFileSync(statePath))) process.exit(22);
if (second.status !== 0) { process.stdout.write('mismatched'); process.exit(0); }
let exact;
try { exact = JSON.parse(second.stdout); } catch { process.stdout.write('mismatched'); process.exit(0); }
const expected = process.env.EXPECTED_COMPOSITE;
const matches = (row) => row.VersionId === version && row.ContentLength === artifact.byteLength && row.ChecksumType === 'COMPOSITE' && row.ChecksumSHA256 === expected;
process.stdout.write(matches(current) && matches(exact) ? 'proved' : 'mismatched');
NODE
)" || fail "Read-only completed-object check could not finish; saved state was not modified" 70
unset expected_composite
[[ "$result" == "proved" || "$result" == "absent" || "$result" == "mismatched" ]] || fail "Read-only completed-object check returned an invalid local result" 70
print -- "Completed-object result: $result"
