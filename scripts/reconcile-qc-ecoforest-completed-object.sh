#!/bin/zsh
set -euo pipefail
umask 077
source "${0:A:h}/aws-direct-mfa-role-session.sh"

# Owner-local, MFA-gated reconciliation for the one already-proved completed
# Québec ecoforest-map payload.  This script is deliberately separate from the
# multipart promotion runner: it has no upload, multipart, sidecar, deletion,
# legal-hold, bypass, or original-inventory path.
PROFILE="WitnessTreeArchiveOperator"
ROLE="WitnessTreeQcArchivePromotionUploader"
ACCOUNT="286853118812"
BUCKET="witness-tree-raw-archive-ca-central-1"
REGION="ca-central-1"
RETAIN_UNTIL="2033-08-12T00:00:00Z"
PART_SIZE=134217728
ARTIFACT_ID="qc-ecoforest-map-2026-08-14"
EXPECTED_PAYLOAD_KEY="raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/payload/carte_eco_maj_prov_gpkg.zip"
EXPECTED_MANIFEST_KEY="raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/manifest.json"
EXPECTED_SOURCE_RELATIVE="raw/qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip"
EXPECTED_SOURCE_BYTES=12399475076
EXPECTED_SOURCE_SHA="c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$ROOT/data/qc-immutable-promotion-preparation.json"
DATA_ROOT="${WITNESS_TREE_DATA_ROOT:-/Volumes/Extended_SSD/Witness_Tree-data}"
STATE_ROOT="/private/tmp/witness-tree-qc-archive-promotion-state"
TMP=""
STATE=""
STATE_LOCK=""
LOCK_HELD=false
RETENTION_ATTEMPTED=false
RETENTION_READBACK_VERIFIED=false

cleanup() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN bootstrap identity creds mfa_serial totp version expected_composite
  if [[ "$LOCK_HELD" == true && -n "$STATE_LOCK" && -d "$STATE_LOCK" && ! -L "$STATE_LOCK" ]]; then
    rmdir "$STATE_LOCK" 2>/dev/null || true
  fi
  [[ -n "$TMP" && -d "$TMP" && ! -L "$TMP" ]] && rm -rf "$TMP"
}
trap cleanup EXIT

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required; no AWS call was made" 69; }
file_mode() { stat -f %Lp "$1"; }
file_owner() { stat -f %u "$1"; }
file_inode() { stat -f %i "$1"; }
state_digest() { shasum -a 256 "$STATE" | awk '{print $1}'; }
state_identity() { print -- "$(file_inode "$STATE"):$(file_mode "$STATE"):$(file_owner "$STATE"):$(stat -f %z "$STATE")"; }

require_private_state() {
  local state_dir
  state_dir="${STATE:h}"
  [[ -d "$STATE_ROOT" && ! -L "$STATE_ROOT" && "$(file_owner "$STATE_ROOT")" == "$(id -u)" && "$(file_mode "$STATE_ROOT")" == 700 ]] || fail "Approved private state root is not owner-only; no TOTP or AWS call was made" 65
  [[ -d "$state_dir" && ! -L "$state_dir" && "$(file_owner "$state_dir")" == "$(id -u)" && "$(file_mode "$state_dir")" == 700 ]] || fail "Approved ecoforest state directory is not owner-only; no TOTP or AWS call was made" 65
  [[ -f "$STATE" && ! -L "$STATE" && "$(file_owner "$STATE")" == "$(id -u)" && "$(file_mode "$STATE")" == 600 ]] || fail "Approved ecoforest state is not an owner-only mode-600 file; no TOTP or AWS call was made" 65
}

state_unchanged() {
  [[ "$(state_identity)" == "$STATE_IDENTITY" && "$(state_digest)" == "$STATE_DIGEST" ]]
}

stop_on_state_race() {
  if ! state_unchanged; then
    if [[ "$RETENTION_ATTEMPTED" == true ]]; then
      if [[ "$RETENTION_READBACK_VERIFIED" == true ]]; then
        fail "Retention read-back was verified, but the private state changed before reconciliation; state was not updated" 75
      fi
      fail "Retention may have been applied, but the private state changed before read-back; state was not updated" 75
    fi
    fail "Private state changed during reconciliation; no retention or state update was attempted" 75
  fi
}

exact_state_schema() {
  local state_json="$1"
  jq -e --arg id "$ARTIFACT_ID" --arg payload "$PAYLOAD_KEY" --arg manifest "$MANIFEST_KEY" --arg sha "$SOURCE_SHA" --argjson bytes "$SOURCE_BYTES" --argjson partSize "$PART_SIZE" '
    .artifactId==$id and .payloadKey==$payload and .manifestKey==$manifest and .sha256==$sha and
    .byteLength==$bytes and .partSizeBytes==$partSize and .initiation=="accepted" and
    (.uploadId|type=="string" and length>0) and
    has("payloadVersionId") and has("compositeChecksumSha256") and
    ((.payloadVersionId==null) or (.payloadVersionId|type=="string" and length>0)) and
    ((.compositeChecksumSha256==null) or (.compositeChecksumSha256|type=="string" and length>0))
  ' <<<"$state_json" >/dev/null
}

# Compute the exact AWS multipart composite SHA-256 locally, validate the
# approved source and the existing private state, and emit only the digest
# needed internally.  No identifiers are printed by this helper.
compute_local_composite() {
  node - "$PLAN" "$DATA_ROOT" "$STATE" "$ARTIFACT_ID" "$PART_SIZE" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const [planPath, dataRoot, statePath, artifactId, rawPartSize] = process.argv.slice(2);
const partSize = Number(rawPartSize);
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const artifact = plan.artifacts.find((row) => row.id === artifactId);
if (!artifact || partSize !== 134217728) process.exit(10);
const source = path.join(dataRoot, artifact.localPath);
const sourceStat = fs.lstatSync(source);
if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size !== artifact.byteLength) process.exit(11);
const stateStat = fs.lstatSync(statePath);
if (!stateStat.isFile() || stateStat.isSymbolicLink() || stateStat.uid !== process.getuid() || (stateStat.mode & 0o777) !== 0o600) process.exit(12);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (state.artifactId !== artifact.id || state.payloadKey !== artifact.payloadKey || state.sha256 !== artifact.sha256 ||
    state.byteLength !== artifact.byteLength || state.partSizeBytes !== partSize || state.initiation !== "accepted" ||
    typeof state.uploadId !== "string" || !state.uploadId ||
    !Object.prototype.hasOwnProperty.call(state, "payloadVersionId") ||
    !Object.prototype.hasOwnProperty.call(state, "compositeChecksumSha256") ||
    (state.payloadVersionId !== null && typeof state.payloadVersionId !== "string") ||
    (state.compositeChecksumSha256 !== null && typeof state.compositeChecksumSha256 !== "string")) process.exit(13);
const fd = fs.openSync(source, "r");
const buffer = Buffer.allocUnsafe(partSize);
const partDigests = [];
const whole = crypto.createHash("sha256");
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
    partDigests.push(crypto.createHash("sha256").update(chunk).digest());
    offset += wanted;
  }
} finally {
  fs.closeSync(fd);
}
if (whole.digest("hex") !== artifact.sha256) process.exit(15);
process.stdout.write(`${crypto.createHash("sha256").update(Buffer.concat(partDigests)).digest("base64")}-${partDigests.length}`);
NODE
}

[[ $# -eq 1 && "$1" == "--run" ]] || fail "Use only: zsh scripts/reconcile-qc-ecoforest-completed-object.sh --run" 64
for tool in aws jq node shasum stat id; do need "$tool"; done
[[ -t 0 && -t 1 ]] || fail "Fresh MFA TOTP requires an interactive terminal; no AWS call was made" 64

artifact_json="$(jq -c --arg id "$ARTIFACT_ID" '[.artifacts[] | select(.id==$id)] | if length==1 then .[0] else empty end' "$PLAN")" || fail "Approved ecoforest plan could not be read; no AWS call was made" 65
[[ -n "$artifact_json" ]] || fail "Approved ecoforest artifact is absent from the plan; no AWS call was made" 65
PAYLOAD_KEY="$(jq -r '.payloadKey' <<<"$artifact_json")"; MANIFEST_KEY="$(jq -r '.manifestKey' <<<"$artifact_json")"
SOURCE_BYTES="$(jq -r '.byteLength' <<<"$artifact_json")"; SOURCE_SHA="$(jq -r '.sha256' <<<"$artifact_json")"
SOURCE_RELATIVE="$(jq -r '.localPath' <<<"$artifact_json")"
[[ "$PAYLOAD_KEY" == "$EXPECTED_PAYLOAD_KEY" && "$MANIFEST_KEY" == "$EXPECTED_MANIFEST_KEY" && "$SOURCE_BYTES" == "$EXPECTED_SOURCE_BYTES" && "$SOURCE_SHA" == "$EXPECTED_SOURCE_SHA" && "$SOURCE_RELATIVE" == "$EXPECTED_SOURCE_RELATIVE" ]] || fail "Approved ecoforest plan does not bind the exact authorized ecoforest artifact; no AWS call was made" 65
STATE="$STATE_ROOT/${ARTIFACT_ID}-${SOURCE_SHA}/state.json"
require_private_state

# An atomic mkdir is the local race barrier.  An existing lock is never
# removed or reused because its owner and freshness cannot be inferred.
STATE_LOCK="$STATE.lock"
if ! mkdir "$STATE_LOCK" 2>/dev/null; then fail "Private state is already locked; no TOTP or AWS call was made" 75; fi
LOCK_HELD=true
[[ ! -L "$STATE_LOCK" && "$(file_owner "$STATE_LOCK")" == "$(id -u)" && "$(file_mode "$STATE_LOCK")" == 700 ]] || fail "Private state lock is not owner-only; no TOTP or AWS call was made" 75

state_before="$(<"$STATE")" || fail "Approved private state could not be read; no AWS call was made" 65
exact_state_schema "$state_before" || fail "Approved private state does not bind the exact ecoforest artifact; no AWS call was made" 65
STATE_IDENTITY="$(state_identity)"; STATE_DIGEST="$(state_digest)"

TMP="$(mktemp -d /private/tmp/witness-tree-qc-ecoforest-reconcile.XXXXXX)" || fail "Private reconciliation workspace could not be created; no AWS call was made" 70
chmod 700 "$TMP"
expected_composite="$(compute_local_composite)" || fail "Approved local bytes or private state failed checksum validation; no AWS call was made" 70
[[ "$expected_composite" =~ '^[A-Za-z0-9+/=]+-[0-9]+$' ]] || fail "Approved local multipart checksum was not produced; no AWS call was made" 70
stop_on_state_race

wt_assume_direct_mfa_role "$PROFILE" "$ACCOUNT" "$ROLE" witness-tree-qc-ecoforest-reconciliation >"$TMP/role.json"
state_unchanged || fail "Private state changed during role assumption; no S3 call was made" 75
jq -e --arg account "$ACCOUNT" --arg role "$ROLE" '.AssumedRoleUser.Arn | type=="string" and startswith("arn:aws:sts::"+$account+":assumed-role/"+$role+"/")' "$TMP/role.json" >/dev/null || fail "Assumed role identity was not the approved role; no S3 call was made" 77
export AWS_ACCESS_KEY_ID="$(jq -er '.Credentials.AccessKeyId | select(type=="string" and length>0)' "$TMP/role.json")" AWS_SECRET_ACCESS_KEY="$(jq -er '.Credentials.SecretAccessKey | select(type=="string" and length>0)' "$TMP/role.json")" AWS_SESSION_TOKEN="$(jq -er '.Credentials.SessionToken | select(type=="string" and length>0)' "$TMP/role.json")" || fail "Approved role response was incomplete; no S3 call was made" 77

head_args=(s3api head-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --checksum-mode ENABLED --region "$REGION" --output json --no-cli-pager)
aws "${head_args[@]}" >"$TMP/current-head.json" 2>"$TMP/current-head.stderr" || fail "Completed ecoforest payload could not be revalidated; private state unchanged and no retention operation was attempted" 75
state_unchanged || fail "Private state changed during current-version validation; no retention operation was attempted" 75
version="$(jq -er '.VersionId | select(type=="string" and length>0 and (test("^[^\\r\\n]+$")))' "$TMP/current-head.json")" || fail "Completed ecoforest payload returned no concrete version; no retention operation was attempted" 75
jq -e --arg version "$version" --argjson bytes "$SOURCE_BYTES" --arg checksum "$expected_composite" '.VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' "$TMP/current-head.json" >/dev/null || fail "Current completed ecoforest payload does not exactly match approved bytes and composite checksum; no retention operation was attempted" 75

aws s3api head-object --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$version" --checksum-mode ENABLED --region "$REGION" --output json --no-cli-pager >"$TMP/exact-head.json" 2>"$TMP/exact-head.stderr" || fail "Completed ecoforest payload version could not be revalidated; no retention operation was attempted" 75
state_unchanged || fail "Private state changed during exact-version validation; no retention operation was attempted" 75
jq -e --arg version "$version" --argjson bytes "$SOURCE_BYTES" --arg checksum "$expected_composite" '.VersionId==$version and .ContentLength==$bytes and .ChecksumType=="COMPOSITE" and .ChecksumSHA256==$checksum' "$TMP/exact-head.json" >/dev/null || fail "Exact completed ecoforest payload version does not match approved bytes and composite checksum; no retention operation was attempted" 75

state_before="$(<"$STATE")" || fail "Private state could not be reread before retention; no retention operation was attempted" 65
exact_state_schema "$state_before" || fail "Private state changed schema before retention; no retention operation was attempted" 75
jq -e --arg version "$version" --arg checksum "$expected_composite" '(.payloadVersionId==null or .payloadVersionId==$version) and (.compositeChecksumSha256==null or .compositeChecksumSha256==$checksum)' <<<"$state_before" >/dev/null || fail "Private state contains a different completed version or checksum; no retention operation was attempted" 75
STATE_IDENTITY="$(state_identity)"; STATE_DIGEST="$(state_digest)"

RETENTION_ATTEMPTED=true
aws s3api put-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$version" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL" --region "$REGION" --no-cli-pager >"$TMP/put-retention.json" 2>"$TMP/put-retention.stderr" || fail "Retention application failed or is unknown; private state was not updated" 75
state_unchanged || fail "Retention may have been applied, but private state changed after the retention operation; private state was not updated" 75

aws s3api get-object-retention --bucket "$BUCKET" --key "$PAYLOAD_KEY" --version-id "$version" --region "$REGION" --output json --no-cli-pager >"$TMP/get-retention.json" 2>"$TMP/get-retention.stderr" || fail "Retention may have been applied, but retention read-back failed; private state was not updated" 75
state_unchanged || fail "Retention may have been applied, but private state changed during retention read-back; private state was not updated" 75
retention_instant="$(jq -er '.Retention.Mode | select(.=="COMPLIANCE")' "$TMP/get-retention.json" >/dev/null && jq -er '.Retention.RetainUntilDate | select(type=="string" and length>0)' "$TMP/get-retention.json")" || fail "Retention may have been applied, but exact COMPLIANCE read-back failed; private state was not updated" 75
node -e 'const [expected, actual] = process.argv.slice(1); if (!Number.isFinite(Date.parse(actual)) || Date.parse(actual) !== Date.parse(expected)) process.exit(1)' "$RETAIN_UNTIL" "$retention_instant" || fail "Retention may have been applied, but exact COMPLIANCE retention date did not read back; private state was not updated" 75
RETENTION_READBACK_VERIFIED=true

# Only now may the existing private recovery state receive the two proved
# fields.  The non-version fields are checked against a canonical snapshot to
# prove that the update cannot broaden its scope.
stop_on_state_race
jq -S -c 'del(.payloadVersionId,.compositeChecksumSha256)' "$STATE" >"$TMP/state-before-nonversion.json" || fail "Private state could not be prepared for its bounded update; retention was verified and state was not updated" 75
state_temp="$STATE.tmp.$$"
jq --arg version "$version" --arg checksum "$expected_composite" 'if ((.payloadVersionId==null or .payloadVersionId==$version) and (.compositeChecksumSha256==null or .compositeChecksumSha256==$checksum)) then .payloadVersionId=$version | .compositeChecksumSha256=$checksum else error("state precondition changed") end' "$STATE" >"$state_temp" || fail "Private state precondition changed; retention was verified and state was not updated" 75
chmod 600 "$state_temp"
[[ -f "$state_temp" && ! -L "$state_temp" && "$(file_owner "$state_temp")" == "$(id -u)" && "$(file_mode "$state_temp")" == 600 ]] || fail "Private state update was not owner-only; retention was verified and state was not updated" 75
state_unchanged || fail "Private state changed before its bounded update; retention was verified and state was not updated" 75
mv -f "$state_temp" "$STATE" || fail "Private state update failed after retention read-back; retention was verified but state may still be unchanged" 75
[[ -f "$STATE" && ! -L "$STATE" && "$(file_owner "$STATE")" == "$(id -u)" && "$(file_mode "$STATE")" == 600 ]] || fail "Private state update boundary could not be verified; retention was verified but state status is uncertain" 75
jq -e --arg version "$version" --arg checksum "$expected_composite" '.payloadVersionId==$version and .compositeChecksumSha256==$checksum' "$STATE" >/dev/null || fail "Private state update read-back failed after retention verification; retention was verified but state status is uncertain" 75
jq -S -c 'del(.payloadVersionId,.compositeChecksumSha256)' "$STATE" >"$TMP/state-after-nonversion.json" || fail "Private state scope could not be verified after update; retention was verified but state status is uncertain" 75
cmp -s "$TMP/state-before-nonversion.json" "$TMP/state-after-nonversion.json" || fail "Private state update changed an unauthorized field; retention was verified but state status is uncertain" 75

print -- "Bounded ecoforest reconciliation completed: exact payload validation, COMPLIANCE retention read-back, and the two-field private state update passed."
