import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeExclusiveMode600 } from "../scripts/assemble-qc-immutable-promotion-attestation.mjs";
import { validateFederalAttestationPair, validateRedactedFederalAttestation } from "../scripts/check-federal-electoral-promotion-attestation.mjs";
import { canonicalPolicySha256 } from "../scripts/check-federal-electoral-promotion-iam.mjs";
import { classifyFederalHeadAbsence } from "../scripts/classify-federal-head-absence.mjs";
import { copyStableDescriptor } from "../scripts/federal-electoral-stable-file.mjs";

const root = new URL("../", import.meta.url).pathname;
const runner = new URL("../scripts/run-federal-electoral-approved-promotion.sh", import.meta.url).pathname;
const planPath = new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url).pathname;
const iamPath = new URL("../data/federal-electoral-promotion-iam-desired-state.json", import.meta.url).pathname;
const plan = JSON.parse(readFileSync(planPath));
const desired = JSON.parse(readFileSync(iamPath));
const dataRoot = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const source = join(dataRoot, "raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip");

function liveIam() {
  return {
    schemaVersion: "witness-tree/federal-electoral-promotion-iam-live-attestation/1",
    status: "live-readback-passed",
    capturedAt: "2026-08-23T12:00:00.000Z",
    account: desired.account,
    region: desired.region,
    bucket: desired.bucket,
    operatorArn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
    roleArn: "arn:aws:iam::286853118812:role/WitnessTreeArchivePromotionUploader",
    roleIdentityArn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-federal-electoral-promotion",
    trustPolicy: desired.trustPolicy,
    operatorPolicy: desired.operatorPolicy,
    rolePolicy: desired.rolePolicy,
    policyDigests: { trustPolicySha256: canonicalPolicySha256(desired.trustPolicy), operatorPolicySha256: canonicalPolicySha256(desired.operatorPolicy), rolePolicySha256: canonicalPolicySha256(desired.rolePolicy) },
    accessAnalyzer: { rolePolicyFindings: 0, operatorPolicyFindings: 0 },
    simulations: { exactRoleAssume: "allowed", otherRoleAssume: "implicitDeny", exactObjectApprovedActions: "allowed", exactObjectDeleteObject: "implicitDeny", exactObjectIamGetRole: "implicitDeny", otherObjectPutAndReadback: "implicitDeny" },
    mutation: { iamMutationPerformed: false, s3MutationPerformed: false },
    recoveryBoundary: { replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false }
  };
}

function fakeAws(dir, phase) {
  const marker = join(dir, "calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
marker=${JSON.stringify(marker)}
print -- "$1:$2 $*" >> "$marker"
arg_value() { local wanted="$1" previous=""; shift; local arg; for arg in "$@"; do if [[ "$previous" == "$wanted" ]]; then print -n -- "$arg"; return 0; fi; previous="$arg"; done; return 1; }
case "$1:$2" in
  configure:get) print -- 'arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device' ;;
  sts:get-session-token) print -- '{"Credentials":{"AccessKeyId":"dummy-operator","SecretAccessKey":"dummy-secret","SessionToken":"dummy-session"}}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy-role","SecretAccessKey":"dummy-role-secret","SessionToken":"dummy-role-session"}}' ;;
  sts:get-caller-identity)
    count=$(grep -c 'sts:get-caller-identity' "$marker" || true)
    if [[ "$count" == 1 ]]; then print -- '{"UserId":"operator-user","Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}';
    elif [[ "${phase}" == role-mismatch ]]; then print -- '{"UserId":"wrong-role","Account":"286853118812","Arn":"arn:aws:sts::286853118812:assumed-role/OtherRole/witness-tree-federal-electoral-promotion"}';
    else print -- '{"UserId":"assumed-role","Account":"286853118812","Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-federal-electoral-promotion"}'; fi ;;
  s3api:list-object-versions)
    key=$(arg_value --prefix "$@")
    if [[ "${phase}" == delete-marker && "$key" != *manifest.json* ]]; then print -- '{"IsTruncated":false,"Versions":[],"DeleteMarkers":[{"Key":"'"$key"'","VersionId":"delete-marker"}]}';
    elif [[ "$key" == *manifest.json* ]]; then
      count=$(grep -c 's3api:list-object-versions.*manifest' "$marker" || true)
      if (( count > 1 )); then print -- '{"IsTruncated":false,"Versions":[{"Key":"'"$key"'","VersionId":"manifest-abc12345"}],"DeleteMarkers":[]}'; else print -- '{"IsTruncated":false,"Versions":[],"DeleteMarkers":[]}'; fi
    else
      count=$(grep -c 's3api:list-object-versions.*federalelectoraldistricts' "$marker" || true)
      if (( count > 1 )); then print -- '{"IsTruncated":false,"Versions":[{"Key":"'"$key"'","VersionId":"payload-abc12345"}],"DeleteMarkers":[]}'; else print -- '{"IsTruncated":false,"Versions":[],"DeleteMarkers":[]}'; fi
    fi ;;
  s3api:head-object)
    if [[ "$*" == *--if-none-match* ]]; then if [[ "${phase}" == ambiguous ]]; then print -u2 -- 'An error occurred (404) when calling the HeadObject operation: Not Found'; print -u2 -- 'An error occurred (AccessDenied)'; else print -u2 -- 'An error occurred (404) when calling the HeadObject operation: Not Found'; fi; exit 254; fi
    key=$(arg_value --key "$@")
    if [[ "$key" == *manifest.json* ]]; then checksum=$(<"$marker.manifest-checksum"); bytes=$(<"$marker.manifest-bytes"); print -- '{"VersionId":"manifest-abc12345","ContentLength":'"$bytes"',"ChecksumType":"FULL_OBJECT","ChecksumSHA256":"'"$checksum"'"}';
    else checksum=$(<"$marker.payload-checksum"); print -- '{"VersionId":"payload-abc12345","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumSHA256":"'"$checksum"'"}'; fi ;;
  s3api:put-object)
    key=$(arg_value --key "$@")
    body=$(arg_value --body "$@")
    checksum=$(arg_value --checksum-sha256 "$@")
    if [[ "$key" == *manifest.json* ]]; then print -n -- "$checksum" > "$marker.manifest-checksum"; print -n -- "$(stat -f %z "$body")" > "$marker.manifest-bytes"; print -- '{"VersionId":"manifest-abc12345","ChecksumSHA256":"'"$checksum"'"}'; else print -n -- "$checksum" > "$marker.payload-checksum"; print -- '{"VersionId":"payload-abc12345","ChecksumSHA256":"'"$checksum"'"}'; fi ;;
  s3api:put-object-retention) print -- '{}' ;;
  s3api:get-object-retention) if [[ "${phase}" == retention-mismatch ]]; then print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-13T00:00:00Z"}}'; else print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}'; fi ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  return marker;
}

function writeReadyReadiness(dir) {
  const record = JSON.parse(readFileSync(new URL("../data/archive-operations-readiness.json", import.meta.url), "utf8"));
  record.status = "ready";
  record.notice = "Archive operations are ready for this exact owner-authorized primary promotion; this control record remains non-admitting and does not itself authorize any upload.";
  record.archive.resourceState = "configured-no-objects";
  record.decisions.recoveryCopy.state = "approved";
  record.decisions.recoveryCopy.reason = "The archive owner approved the separately evidenced Canadian recovery design; this does not authorize a federal recovery object write.";
  record.decisions.replication.state = "approved-canadian";
  record.decisions.replication.reason = "The archive owner approved the separately evidenced Canadian-only replication design; this does not authorize a federal recovery object write.";
  for (const control of record.controls) {
    control.state = "evidenced";
    control.evidence = control.requiredEvidence.map((requirement, index) => ({ kind: requirement, capturedAt: `2026-08-23T12:0${index}:00Z`, reference: `sha256:${hash(`${control.id}:${index}:${requirement}`)}`, reviewerRole: "Archive owner" }));
  }
  const path = join(dir, "archive-readiness.json"); writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 }); return path;
}

function invoke(dir, phase = "success", extraEnv = {}) {
  const privateOutput = join(dir, "private.json"); const publicOutput = join(dir, "public.json"); const livePath = join(dir, "live-iam.json"); const readinessPath = writeReadyReadiness(dir); writeFileSync(livePath, `${JSON.stringify(liveIam(), null, 2)}\n`, { mode: 0o600 }); const marker = fakeAws(dir, phase);
  const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
set env(FEDERAL_DATA_ROOT) ${JSON.stringify(dataRoot)}
set env(FEDERAL_IAM_ATTESTATION) ${JSON.stringify(livePath)}
set env(FEDERAL_ARCHIVE_READINESS) ${JSON.stringify(readinessPath)}
set env(FEDERAL_PRIVATE_OUTPUT) ${JSON.stringify(privateOutput)}
set env(FEDERAL_PUBLIC_OUTPUT) ${JSON.stringify(publicOutput)}
spawn -noecho zsh ${JSON.stringify(runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, ...extraEnv, PATH: `${dir}:${process.env.PATH}`, FEDERAL_DATA_ROOT: dataRoot, FEDERAL_IAM_ATTESTATION: livePath, FEDERAL_ARCHIVE_READINESS: readinessPath, FEDERAL_PRIVATE_OUTPUT: privateOutput, FEDERAL_PUBLIC_OUTPUT: publicOutput } });
  return { run, privateOutput, publicOutput, marker, livePath, readinessPath };
}

test("federal preflight validates plan-bound local identity without AWS or MFA", () => {
  const run = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, FEDERAL_DATA_ROOT: dataRoot } });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`); assert.match(run.stdout, /no TOTP or AWS call was made/);
});

test("federal absence classifier accepts exactly one provider error and rejects ambiguity", () => {
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found"), "absent");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found\n"), "absent");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found\n\n"), "occupied-or-ambiguous");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found\nAn error occurred (AccessDenied)"), "ambiguous");
  assert.equal(classifyFederalHeadAbsence("An error occurred (AccessDenied) when calling the HeadObject operation: Forbidden"), "occupied-or-ambiguous");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation (reached max retries: 4): Not Found"), "occupied-or-ambiguous");
});

test("live IAM gate is required before MFA and does not leak provider values", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-gate-")); const marker = join(dir, "calls");
  try {
    const readinessPath = writeReadyReadiness(dir);
    writeFileSync(join(dir, "aws"), `#!/bin/zsh\nprint -- called > ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    const run = spawnSync("zsh", [runner, "--run"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FEDERAL_DATA_ROOT: dataRoot, FEDERAL_ARCHIVE_READINESS: readinessPath, FEDERAL_PRIVATE_OUTPUT: join(dir, "private"), FEDERAL_PUBLIC_OUTPUT: join(dir, "public"), FEDERAL_IAM_ATTESTATION: join(dir, "missing-live.json") }});
    assert.equal(run.status, 75); assert.match(`${run.stdout}${run.stderr}`, /live IAM policy/); assert.equal(existsSync(marker), false); assert.doesNotMatch(`${run.stdout}${run.stderr}`, /arn:aws|123456/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ambiguous destination state stops before every conditional write", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-ambiguous-"));
  try { const { run, marker, privateOutput, publicOutput } = invoke(dir, "ambiguous"); assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /absence|version list/i); assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456|provider-user-id|arn:aws/); assert.doesNotMatch(readFileSync(marker, "utf8"), /s3api:put-object/); assert.equal(existsSync(privateOutput), false); assert.equal(existsSync(publicOutput), false); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("delete markers and version-list drift stop before any write", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-delete-marker-"));
  try { const { run, marker } = invoke(dir, "delete-marker"); assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /version, delete marker/i); assert.doesNotMatch(readFileSync(marker, "utf8"), /s3api:put-object/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("preexisting evidence output stops before MFA and AWS", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-output-"));
  try { const privateOutput = join(dir, "private.json"); writeFileSync(privateOutput, "preexisting", { mode: 0o600 }); const { run, marker, publicOutput } = invoke(dir); assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`); assert.equal(existsSync(marker), false); assert.equal(readFileSync(privateOutput, "utf8"), "preexisting"); assert.equal(existsSync(publicOutput), false); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("post-assume identity mismatch stops before the first S3 write", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-role-mismatch-"));
  try { const { run, marker } = invoke(dir, "role-mismatch"); assert.equal(run.status, 77, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /exact approved federal role/); assert.doesNotMatch(readFileSync(marker, "utf8"), /s3api:/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retention mismatch preserves machine evidence and publishes no attestation", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-retention-"));
  try { const { run, marker, privateOutput, publicOutput } = invoke(dir, "retention-mismatch"); assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /retention read-back mismatch/); assert.equal((readFileSync(marker, "utf8").match(/s3api:put-object /g) || []).length, 1); assert.equal(existsSync(privateOutput), false); assert.equal(existsSync(publicOutput), false); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("successful run binds conditional versions, local/provider checksums, post-write version lists, IAM digests, and primary-only credit boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-success-"));
  try {
    const { run, marker, privateOutput, publicOutput, livePath } = invoke(dir); assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`); const publicValue = JSON.parse(readFileSync(publicOutput)); validateFederalAttestationPair(privateOutput, publicValue, plan, { liveIamPath: livePath }); validateRedactedFederalAttestation(publicValue, plan, { liveIamPath: livePath }); assert.match(readFileSync(privateOutput, "utf8"), /rawResponses|approvalSha256|liveIamSha256|archiveReadinessSha256|preActionAuthorization|postActionEvidence|recoveryCreditEligible/); assert.doesNotMatch(readFileSync(publicOutput, "utf8"), /payload-version-1|manifest-version-1|arn:aws:iam/); assert.equal(publicValue.preActionAuthorization.roleName, "WitnessTreeArchivePromotionUploader"); assert.equal(publicValue.postActionEvidence.rawResponseBundleSha256, publicValue.provenance.rawResponseBundleSha256);
    const calls = readFileSync(marker, "utf8"); assert.match(calls, /head-object .*--if-none-match \*/); assert.match(calls, /put-object .*--if-none-match \*/); assert.match(calls, /put-object .*--checksum-algorithm SHA256 .*--checksum-sha256/); assert.match(calls, /head-object .*--version-id payload-abc12345/); assert.match(calls, /head-object .*--version-id manifest-abc12345/); assert.match(calls, /list-object-versions/); assert.doesNotMatch(calls, /delete|abort|bypass/i); assert.equal(publicValue.recoveryAuthorization.recoveryCreditEligible, false); assert.equal(publicValue.recoveryProof.recoveryCreditEligible, false); assert.equal(publicValue.claims.sourceLedgerCreditChanged, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("descriptor-bound stable copy rejects symlink aliases and preserves strong local checksum", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-stable-")); const sourcePath = join(dir, "source.bin"); const destination = join(dir, "stable.bin"); const aliasTarget = join(dir, "alias-target");
  try { writeFileSync(sourcePath, "stable bytes"); writeFileSync(aliasTarget, "do not overwrite"); symlinkSync(aliasTarget, destination); assert.throws(() => copyStableDescriptor({ source: sourcePath, destination, expectedBytes: 12, expectedSha256: hash("stable bytes") })); unlinkSync(destination); const result = copyStableDescriptor({ source: sourcePath, destination, expectedBytes: 12, expectedSha256: hash("stable bytes") }); assert.equal(result.checksumAlgorithm, "SHA256"); assert.equal(result.checksumType, "FULL_OBJECT"); assert.equal(result.checksumSha256, Buffer.from(hash("stable bytes"), "hex").toString("base64")); assert.equal(lstatSync(destination).nlink, 1); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stable-copy rollback never unlinks a replacement inode", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-stable-rollback-")); const sourcePath = join(dir, "source.bin"); const destination = join(dir, "stable.bin"); const replacement = join(dir, "replacement.bin");
  try {
    writeFileSync(sourcePath, "stable bytes"); writeFileSync(replacement, "replacement bytes");
    assert.throws(() => copyStableDescriptor({ source: sourcePath, destination, expectedBytes: 12, expectedSha256: hash("stable bytes"), hooks: { afterFileFsync: () => { unlinkSync(destination); symlinkSync(replacement, destination); throw new Error("injected post-fsync failure"); } } }), /owned rollback was not proved/);
    assert.equal(lstatSync(destination).isSymbolicLink(), true); assert.equal(readFileSync(destination, "utf8"), "replacement bytes");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("federal publication rejects aliases, fsync/close failure, and a replaced inode", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-publication-")); const target = join(dir, "target"); const alias = join(dir, "alias");
  try {
    writeFileSync(target, "existing"); symlinkSync(target, alias); assert.throws(() => writeExclusiveMode600(alias, { safe: true })); unlinkSync(alias);
    const closeFailure = join(dir, "close-failure"); assert.throws(() => writeExclusiveMode600(closeFailure, { safe: true }, { failClose: () => true })); assert.equal(existsSync(closeFailure), false);
    const replaced = join(dir, "replaced"); assert.throws(() => writeExclusiveMode600(replaced, { safe: true }, { beforeVerify: () => { unlinkSync(replaced); symlinkSync(target, replaced); } })); assert.equal(lstatSync(replaced).isSymbolicLink(), true); unlinkSync(replaced);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
