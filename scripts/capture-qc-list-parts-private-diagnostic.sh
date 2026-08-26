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
OUTPUT="/private/tmp/witness-tree-qc-list-parts-diagnostic-2026-08-22.json"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/qc-immutable-promotion-preparation.json"
STATE_ROOT="/private/tmp/witness-tree-qc-archive-promotion-state"

cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap creds identity mfa_serial totp
}
trap cleanup EXIT
fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required" 69; }

[[ $# -eq 5 && "$1" == "--capture" && "$2" == "--artifact-id" && "$4" == "--output" ]] || \
  fail "Use only the exact authorized capture command" 64
[[ "$3" == "$ARTIFACT_ID" && "$5" == "$OUTPUT" ]] || fail "Artifact or output path is outside the exact authorization" 64
for tool in aws jq node; do need "$tool"; done
[[ -t 0 && -t 1 ]] || fail "MFA TOTP prompt requires an interactive terminal; no AWS call was made" 64
[[ ! -e "$OUTPUT" && ! -L "$OUTPUT" ]] || fail "The authorized diagnostic output already exists; it was not overwritten" 73

# Validate the private state before obtaining credentials. No identifiers are printed.
node - "$PLAN" "$STATE_ROOT" "$ARTIFACT_ID" "$BUCKET" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [planPath, stateRoot, artifactId, bucket] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const artifact = plan.artifacts.find((row) => row.id === artifactId);
if (!artifact) process.exit(10);
const statePath = path.join(stateRoot, `${artifact.id}-${artifact.sha256}`, 'state.json');
const lst = fs.lstatSync(statePath);
if (!lst.isFile() || lst.isSymbolicLink() || lst.uid !== process.getuid() || (lst.mode & 0o777) !== 0o600) process.exit(11);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const keys = ['artifactId','payloadKey','manifestKey','sha256','byteLength','partSizeBytes','initiation','uploadId','payloadVersionId','compositeChecksumSha256','sidecarVersionId'];
if (Object.keys(state).sort().join('\0') !== keys.sort().join('\0')) process.exit(12);
if (state.artifactId !== artifact.id || state.payloadKey !== artifact.payloadKey || state.manifestKey !== artifact.manifestKey ||
    state.sha256 !== artifact.sha256 || state.byteLength !== artifact.byteLength || state.initiation !== 'accepted' ||
    typeof state.uploadId !== 'string' || !state.uploadId || typeof state.sidecarVersionId !== 'string' || !state.sidecarVersionId ||
    bucket !== 'witness-tree-raw-archive-ca-central-1') process.exit(13);
NODE
[[ $? -eq 0 ]] || fail "Exact saved multipart state validation failed; no AWS call was made" 70

read -r -s 'totp?Current MFA TOTP (not stored): '
print
[[ "${totp:-}" =~ '^[0-9]{6}$' ]] || fail "TOTP must be exactly six digits; no AWS call was made" 64
mfa_serial="$(aws configure get mfa_serial --profile "$PROFILE" 2>/dev/null || true)"
[[ "$mfa_serial" =~ '^arn:aws:iam::286853118812:mfa/[A-Za-z0-9+=,.@_/-]+$' ]] || fail "Configured MFA serial is not the approved account serial" 69
creds="$(wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-qc-listparts-diagnostic)"
export AWS_ACCESS_KEY_ID="$(jq -r '.Credentials.AccessKeyId' <<<"$creds")" AWS_SECRET_ACCESS_KEY="$(jq -r '.Credentials.SecretAccessKey' <<<"$creds")" AWS_SESSION_TOKEN="$(jq -r '.Credentials.SessionToken' <<<"$creds")"
unset creds

# Node performs exactly one AWS service call, keeps stderr in memory, discards
# stdout, verifies the saved-state bytes did not change, and creates the one
# authorized file with exclusive mode-600 semantics.
node - "$PLAN" "$STATE_ROOT" "$ARTIFACT_ID" "$BUCKET" "$REGION" "$OUTPUT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const [planPath, stateRoot, artifactId, bucket, region, output] = process.argv.slice(2);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const artifact = plan.artifacts.find((row) => row.id === artifactId);
if (!artifact) process.exit(20);
const statePath = path.join(stateRoot, `${artifact.id}-${artifact.sha256}`, 'state.json');
const before = fs.readFileSync(statePath);
const state = JSON.parse(before.toString('utf8'));
const binding = {artifactId, bucket, key: artifact.payloadKey, region, uploadId: state.uploadId};
const env = {...process.env, AWS_MAX_ATTEMPTS: '1', AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off'};
const result = spawnSync('aws', ['s3api','list-parts','--bucket',bucket,'--key',artifact.payloadKey,'--upload-id',state.uploadId,'--region',region,'--output','json','--cli-error-format','legacy','--no-cli-pager'], {
  env, encoding: null, input: Buffer.alloc(0), stdio: ['ignore','ignore','pipe'], maxBuffer: 16 * 1024 * 1024
});
const after = fs.readFileSync(statePath);
if (!before.equals(after)) process.exit(21);
const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
const capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const record = {
  schemaVersion: 'phase1-qc-private-list-parts-diagnostic-v1',
  capturedAt,
  artifactId,
  stage: 'ListParts',
  cliExit: Number.isInteger(result.status) ? result.status : null,
  signal: result.signal ?? null,
  requestBindingSha256: sha(Buffer.from(JSON.stringify(binding))),
  stateBeforeSha256: sha(before),
  stateAfterSha256: sha(after),
  stateUnchanged: true,
  attempts: 1,
  stdoutDisposition: 'discarded',
  stderrByteLength: stderr.length,
  stderrSha256: sha(stderr),
  stderrBase64: stderr.toString('base64'),
  claims: {readOnlyListPartsOnly: true, storageMutationPerformed: false, savedStateMutationPerformed: false, uploadCompleted: false}
};
let fd;
try {
  fd = fs.openSync(output, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  fs.writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
  fs.fsyncSync(fd);
} finally {
  if (fd !== undefined) fs.closeSync(fd);
}
const out = fs.lstatSync(output);
if (!out.isFile() || out.isSymbolicLink() || out.uid !== process.getuid() || (out.mode & 0o777) !== 0o600) process.exit(22);
NODE
[[ $? -eq 0 ]] || fail "Private diagnostic capture failed; saved state was not modified" 70
print -- "Private read-only ListParts diagnostic captured at the exact authorized path; raw contents were not printed."
