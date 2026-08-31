import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { multipartPlan, partCount, sidecarFor, validateQcImmutablePromotionPreparation, writeSidecars } from "../scripts/prepare-qc-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const runnerPath = new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url).pathname;
const directMfaHelper = readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8");
const repositoryRoot = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

function writeQcFakeTools(dir, { serial, identity = { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" } }) {
  const marker = join(dir, "aws-calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- ${JSON.stringify(serial)} ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeQcArchivePromotionUploader/test"}}' ;;
  sts:get-caller-identity) print -- ${JSON.stringify(JSON.stringify(identity))} ;;
  s3api:put-object) exit 88 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "stat"), `#!/bin/zsh
case "$3" in
  *qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip) print -- 12399475076 ;;
  *qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV_GPKG.zip) print -- 11244667626 ;;
  *) exec /usr/bin/stat "$@" ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in
  *qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip) print -- "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1  $3" ;;
  *qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV_GPKG.zip) print -- "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61  $3" ;;
  *) exec /usr/bin/shasum "$@" ;;
esac
`, { mode: 0o700 });
  return marker;
}

function runQcPty(dir) {
  const source = readFileSync(runnerPath, "utf8");
  const isolatedRunner = join(dir, "run-qc-approved-multipart-promotion.sh");
  const isolatedSource = source
    .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
    .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(join(dir, "state"))}`);
  assert.notEqual(isolatedSource, source, "QC runner test must isolate its local resume state.");
  writeFileSync(isolatedRunner, isolatedSource, { mode: 0o700 });
  writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
  const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(isolatedRunner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
}

test("Québec multipart preflight reaches no AWS command when its controlled data root is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  const isolatedRunner = join(dir, "runner.sh");
  const isolatedSource = readFileSync(runnerPath, "utf8")
    .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
    .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(join(dir, "absent-data"))}`);
  writeFileSync(isolatedRunner, isolatedSource, { mode: 0o700 });
  writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [isolatedRunner, "--preflight"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /Approved Québec artifact is missing at the controlled workspace-data path; no TOTP or AWS call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Québec immutable preparation binds only the two completed raw archives to safe append-only keys", () => {
  assert.equal(validateQcImmutablePromotionPreparation(plan), plan);
  assert.deepEqual(plan.artifacts.map((item) => item.id), ["qc-ecoforest-map-2026-08-14", "qc-original-current-inventory-2026-08-14"]);
  assert.equal(plan.artifacts.some((item) => /fourth/i.test(JSON.stringify(item))), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("current"), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("latest"), false);
  assert.deepEqual(plan.proposedRoleScope.retentionKeys, plan.artifacts.map((item) => item.payloadKey));
});

test("each archive has a bounded reviewed sequential multipart plan", () => {
  assert.equal(partCount(12399475076), 93);
  assert.equal(partCount(11244667626), 84);
  for (const artifact of plan.artifacts) {
    const parts = multipartPlan(artifact.byteLength);
    assert.equal(parts.at(-1).offsetBytes + parts.at(-1).byteLength, artifact.byteLength);
    assert.ok(parts.every((part, index) => part.partNumber === index + 1 && part.byteLength > 0));
    assert.ok(parts.length <= 10000);
  }
  assert.throws(() => multipartPlan(12399475076, 16 * 1024 * 1024));
});

test("sidecars are deterministic and the preparation rejects remote claims, aliases, and scope widening", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir).length, 2); assert.throws(() => writeSidecars(plan, dir), /EEXIST/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(sidecarFor(plan, plan.artifacts[0]), /rebuildable-not-locked/);
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, claims: { ...plan.claims, immutableObjectStorage: true } }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, artifacts: [{ ...plan.artifacts[0], archiveSourceId: "qc-current-ecoforest" }, plan.artifacts[1]] }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, proposedRoleScope: { ...plan.proposedRoleScope, retentionKeys: plan.proposedRoleScope.retentionKeys.slice(1) } }));
});

test("owner-local runner is multipart-only and excludes high-level copies, deletion, IAM, and bypass", () => {
  const runner = readFileSync(new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /PRECHECK passed/);
  assert.match(runner, /wt_assume_direct_mfa_role/);
  assert.match(runner, /create-multipart-upload[\s\S]*upload-part[\s\S]*complete-multipart-upload/);
  assert.match(runner, /list-parts[\s\S]*Previously uploaded part does not match/);
  assert.match(runner, /local artifact=.* observed/);
  assert.doesNotMatch(runner, /local observed;/, "Repeated zsh local declarations must not print prior provider metadata.");
  assert.equal((runner.match(/list-parts[^\n]*--cli-error-format legacy/g) ?? []).length, 2);
  assert.equal((runner.match(/list_error_code="\$\(sanitized_list_parts_error_code "\$list_error"\)"/g) ?? []).length, 2);
  assert.equal((runner.match(/list_error_category="\$\(sanitized_list_parts_diagnostic_category "\$list_error"\)"/g) ?? []).length, 2);
  assert.match(runner, /ChecksumType=="COMPOSITE"[\s\S]*put-object-retention[\s\S]*get-object-retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|aws iam /i);
  assert.match(directMfaHelper, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
  assert.match(runner, /NoSuchUpload[\s\S]*head-object[\s\S]*--version-id[\s\S]*state was preserved and no new upload was started/);
});

test("an interrupted not-started state reuses its exact saved sidecar before multipart initiation", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-saved-sidecar-"));
  try {
    const dataRoot = join(dir, "data"); const stateRoot = join(dir, "state"); mkdirSync(dataRoot, { recursive: true }); mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    const fixture = structuredClone(plan);
    for (const [index, artifact] of fixture.artifacts.entries()) {
      const content = Buffer.from(index ? "second-payload" : "first-payload"); const relative = `raw/qc-test/${artifact.id}.bin`; mkdirSync(join(dataRoot, "raw/qc-test"), { recursive: true }); writeFileSync(join(dataRoot, relative), content);
      artifact.localPath = relative; artifact.byteLength = content.length; artifact.sha256 = createHash("sha256").update(content).digest("hex");
    }
    const artifact = fixture.artifacts[0]; const sidecarVersion = "saved-sidecar-version"; const sidecar = sidecarFor(plan, plan.artifacts[0]);
    const sidecarHead = { VersionId: sidecarVersion, ContentLength: Buffer.byteLength(sidecar), ChecksumSHA256: createHash("sha256").update(sidecar).digest("base64") };
    const stateDir = join(stateRoot, `${artifact.id}-${artifact.sha256}`); mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const statePath = join(stateDir, "state.json"); writeFileSync(statePath, `${JSON.stringify({ artifactId: artifact.id, payloadKey: artifact.payloadKey, manifestKey: artifact.manifestKey, sha256: artifact.sha256, byteLength: artifact.byteLength, partSizeBytes: 4, initiation: "not-started", uploadId: null, payloadVersionId: null, compositeChecksumSha256: null, sidecarVersionId: sidecarVersion })}\n`, { mode: 0o600 });
    const fixturePlan = join(dir, "plan.json"); writeFileSync(fixturePlan, `${JSON.stringify(fixture)}\n`);
    const marker = join(dir, "aws-calls");
    writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2 $*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- 'arn:aws:iam::286853118812:mfa/test-device' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeQcArchivePromotionUploader/test"}}' ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  s3api:head-object)
    [[ "$*" == *"--key ${artifact.manifestKey}"* && "$*" == *"--version-id ${sidecarVersion}"* ]] || exit 89
    print -- ${JSON.stringify(JSON.stringify(sidecarHead))} ;;
  s3api:create-multipart-upload) exit 86 ;;
  s3api:put-object) exit 87 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
    const source = readFileSync(runnerPath, "utf8")
      .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
      .replace(/^PLAN=.*$/m, `PLAN=${JSON.stringify(fixturePlan)}`)
      .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(dataRoot)}`)
      .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(stateRoot)}`)
      .replace(/^PART_SIZE=.*$/m, "PART_SIZE=4");
    const runner = join(dir, "runner.sh"); writeFileSync(runner, source, { mode: 0o700 }); writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
    const program = `set timeout 30\nset env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}\nspawn -noecho zsh ${JSON.stringify(runner)} --run\nexpect {\n  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }\n  eof { set result [wait]; exit [lindex $result 3] }\n  timeout { exit 2 }\n}`;
    const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /Multipart initiation failed/);
    const calls = readFileSync(marker, "utf8"); const headIndex = calls.indexOf("s3api:head-object"); const createIndex = calls.indexOf("s3api:create-multipart-upload");
    assert.ok(headIndex >= 0 && createIndex > headIndex, calls); assert.match(calls, new RegExp(`--version-id ${sidecarVersion}`)); assert.doesNotMatch(calls, /s3api:put-object(?:\s|$)/);
    const resultingState = JSON.parse(readFileSync(statePath, "utf8")); assert.equal(resultingState.sidecarVersionId, sidecarVersion); assert.equal(resultingState.uploadId, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("NoSuchUpload adopts only an exact completed version, preserves a mismatch, and never starts a replacement upload", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-nosuchupload-"));
  try {
    const dataRoot = join(dir, "data"); const stateRoot = join(dir, "state"); mkdirSync(dataRoot, { recursive: true }); mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    const fixture = structuredClone(plan); const composites = {}; const payloadHeads = {}; const sidecarHeads = {}; const initialStates = new Map();
    for (const [index, artifact] of fixture.artifacts.entries()) {
      const content = Buffer.from(index ? "second-payload" : "first-payload"); const relative = `raw/qc-test/${artifact.id}.bin`; const file = join(dataRoot, relative); mkdirSync(join(dataRoot, "raw/qc-test"), { recursive: true }); writeFileSync(file, content);
      artifact.localPath = relative; artifact.byteLength = content.length; artifact.sha256 = createHash("sha256").update(content).digest("hex");
      const digests = []; for (let offset = 0; offset < content.length; offset += 4) digests.push(createHash("sha256").update(content.subarray(offset, offset + 4)).digest());
      composites[artifact.id] = `${createHash("sha256").update(Buffer.concat(digests)).digest("base64")}-${digests.length}`;
      payloadHeads[artifact.payloadKey] = { VersionId: `exact-version-${index}`, ContentLength: content.length, ChecksumType: "COMPOSITE", ChecksumSHA256: composites[artifact.id] };
      const sidecar = sidecarFor(plan, plan.artifacts[index]); sidecarHeads[artifact.manifestKey] = { VersionId: `sidecar-version-${index}`, ContentLength: Buffer.byteLength(sidecar), ChecksumSHA256: createHash("sha256").update(sidecar).digest("base64") };
      const stateDir = join(stateRoot, `${artifact.id}-${artifact.sha256}`); mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      const state = { artifactId: artifact.id, payloadKey: artifact.payloadKey, manifestKey: artifact.manifestKey, sha256: artifact.sha256, byteLength: artifact.byteLength, partSizeBytes: 4, initiation: "accepted", uploadId: `saved-upload-${index}`, payloadVersionId: null, compositeChecksumSha256: null, sidecarVersionId: `sidecar-version-${index}` };
      const statePath = join(stateDir, "state.json"); const stateBytes = `${JSON.stringify(state)}\n`; writeFileSync(statePath, stateBytes, { mode: 0o600 }); initialStates.set(statePath, stateBytes);
    }
    payloadHeads[fixture.artifacts[1].payloadKey].ChecksumSHA256 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const fixturePlan = join(dir, "plan.json"); writeFileSync(fixturePlan, `${JSON.stringify(fixture)}\n`);
    const marker = join(dir, "aws-calls"); const behavior = join(dir, "behavior"); const headCounter = join(dir, "head-counter"); writeFileSync(behavior, "normal"); writeFileSync(headCounter, "0"); const aws = join(dir, "aws");
    writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2 $*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- 'arn:aws:iam::286853118812:mfa/test-device' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeQcArchivePromotionUploader/test"}}' ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  s3api:list-parts)
    behavior="$(<${JSON.stringify(behavior)})"
    fake_exit=254
    case "$behavior" in
      ambiguous) print -u2 -- $'An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist.\nAn error occurred (AccessDenied) when calling the ListParts operation: proxy denied the request.' ;;
      expired-token) print -u2 -- 'An error occurred (ExpiredToken) when calling the ListParts operation: The provided token has expired.' ;;
      access-denied) print -u2 -- 'An error occurred (AccessDenied) when calling the ListParts operation: Access Denied' ;;
      validation-error) print -u2 -- $'Parameter validation failed:\nInvalid length for parameter UploadId' ;;
      enhanced) print -u2 -- $'An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist.\n\nError Code: NoSuchUpload\nRequest ID: should-not-be-rendered' ;;
      warning) print -u2 -- $'A CLI warning preceded the provider response.\nAn error occurred (ExpiredToken) when calling the ListParts operation: The provided token has expired.' ;;
      retry-wrapper) print -u2 -- 'An error occurred (ExpiredToken) when calling the ListParts operation (reached max retries: 4): The provided token has expired.' ;;
      identifier-token) print -u2 -- 'An error occurred (AKIAEXAMPLECREDENTIAL) when calling the ListParts operation: rejected.' ;;
      overlength-token) print -u2 -- 'An error occurred (ThisTokenNameIsDeliberatelyLongerThanSixtyFourCharactersAndMustNeverBeRendered12345) when calling the ListParts operation: rejected.' ;;
      punctuation-token) print -u2 -- 'An error occurred (AccessDenied:secret) when calling the ListParts operation: rejected.' ;;
      case-token) print -u2 -- 'An error occurred (accessdenied) when calling the ListParts operation: rejected.' ;;
      mixed-token) print -u2 -- $'An error occurred (ExpiredToken) when calling the ListParts operation: expired.\nAn error occurred (AKIAEXAMPLECREDENTIAL) when calling the ListParts operation: rejected.' ;;
      cli-usage) print -u2 -- $'usage: aws [options] <command> <subcommand> [parameters]\nUnknown options: --private-example'; fake_exit=252 ;;
      credentials-error) print -u2 -- 'Unable to locate credentials. You can configure credentials by running aws configure. PRIVATE-CREDENTIAL-MARKER'; fake_exit=253 ;;
      network-error) print -u2 -- 'Could not connect to the endpoint URL: PRIVATE-ENDPOINT-MARKER'; fake_exit=255 ;;
      timeout-error) print -u2 -- 'Connect timeout on endpoint URL: PRIVATE-TIMEOUT-MARKER'; fake_exit=255 ;;
      process-error) print -u2 -- 'credential_process returned PRIVATE-PROCESS-MARKER'; fake_exit=255 ;;
      blank) : ;;
      *) if [[ "$*" == *"--cli-error-format legacy"* ]]; then print -u2 -- 'An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist.'; else print -u2 -- $'An error occurred (NoSuchUpload) when calling the ListParts operation: The specified upload does not exist.\n\nError Code: NoSuchUpload\nRequest ID: redacted'; fi ;;
    esac
    exit "$fake_exit" ;;
  s3api:head-object)
    key=""; while (( $# )); do if [[ "$1" == "--key" ]]; then key="$2"; break; fi; shift; done
    behavior="$(<${JSON.stringify(behavior)})"
    if [[ "$behavior" == "missing-head" && "$key" == *"/payload/"* ]]; then exit 44; fi
    if [[ "$key" == *"/payload/"* ]]; then n=$(( $(<${JSON.stringify(headCounter)}) + 1 )); print -- "$n" > ${JSON.stringify(headCounter)}; fi
    case "$key" in
      ${JSON.stringify(fixture.artifacts[0].manifestKey)}) print -- ${JSON.stringify(JSON.stringify(sidecarHeads[fixture.artifacts[0].manifestKey]))} ;;
      ${JSON.stringify(fixture.artifacts[1].manifestKey)}) print -- ${JSON.stringify(JSON.stringify(sidecarHeads[fixture.artifacts[1].manifestKey]))} ;;
      ${JSON.stringify(fixture.artifacts[0].payloadKey)})
        if [[ "$behavior" == "third-race" && "$(<${JSON.stringify(headCounter)})" -ge 3 ]]; then print -- '{"VersionId":"exact-version-0","ContentLength":13,"ChecksumType":"COMPOSITE","ChecksumSHA256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}'; elif [[ "$behavior" == "exact-version-mismatch" && "$*" == *"--version-id"* ]]; then print -- '{"VersionId":"exact-version-0","ContentLength":13,"ChecksumType":"COMPOSITE","ChecksumSHA256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}'; else print -- ${JSON.stringify(JSON.stringify(payloadHeads[fixture.artifacts[0].payloadKey]))}; fi ;;
      ${JSON.stringify(fixture.artifacts[1].payloadKey)}) print -- ${JSON.stringify(JSON.stringify(payloadHeads[fixture.artifacts[1].payloadKey]))} ;;
      *) exit 99 ;;
    esac ;;
  s3api:put-object-retention) print -- '{}' ;;
  s3api:get-object-retention) if [[ "$(<${JSON.stringify(behavior)})" == "wrong-retention" ]]; then print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T01:00:00Z"}}'; else print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}'; fi ;;
  *) exit 98 ;;
esac
`, { mode: 0o700 }); chmodSync(aws, 0o700);
    const source = readFileSync(runnerPath, "utf8")
      .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
      .replace(/^PLAN=.*$/m, `PLAN=${JSON.stringify(fixturePlan)}`)
      .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(dataRoot)}`)
      .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(stateRoot)}`)
      .replace(/^PART_SIZE=.*$/m, "PART_SIZE=4");
    const runner = join(dir, "runner.sh"); writeFileSync(runner, source, { mode: 0o700 }); writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
    const runOwner = () => { const program = `set timeout 30\nset env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}\nspawn -noecho zsh ${JSON.stringify(runner)} --run\nexpect {\n  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }\n  eof { set result [wait]; exit [lindex $result 3] }\n  timeout { exit 2 }\n}`; return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }); };
    const reset = (mode) => { for (const [path, bytes] of initialStates) writeFileSync(path, bytes, { mode: 0o600 }); writeFileSync(behavior, mode); writeFileSync(headCounter, "0"); writeFileSync(marker, ""); };
    const run = runOwner();
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`); assert.match(run.stdout, /Recovered completed payload evidence after NoSuchUpload/); assert.match(`${run.stdout}${run.stderr}`, /current exact-key object does not match.*state was preserved and no new upload was started/i);
    const calls = readFileSync(marker, "utf8"); assert.doesNotMatch(calls, /create-multipart-upload|upload-part|complete-multipart-upload|put-object(?:\s|$)/);
    const exactArtifact = fixture.artifacts[0]; const exactState = JSON.parse(readFileSync(join(stateRoot, `${exactArtifact.id}-${exactArtifact.sha256}`, "state.json"), "utf8"));
    assert.equal(exactState.payloadVersionId, "exact-version-0"); assert.equal(exactState.compositeChecksumSha256, composites[exactArtifact.id]);
    const mismatchedArtifact = fixture.artifacts[1]; const mismatchedState = JSON.parse(readFileSync(join(stateRoot, `${mismatchedArtifact.id}-${mismatchedArtifact.sha256}`, "state.json"), "utf8"));
    assert.equal(mismatchedState.payloadVersionId, null); assert.equal(mismatchedState.compositeChecksumSha256, null); assert.equal(mismatchedState.uploadId, "saved-upload-1");

    for (const [mode, expectedMessage] of [["ambiguous", /unambiguously classify/], ["missing-head", /no exact completed payload can be proved/], ["exact-version-mismatch", /Exact-version completed candidate does not match/], ["third-race", /Payload version read-back does not prove/]]) {
      reset(mode); const before = new Map([...initialStates.keys()].map((path) => [path, readFileSync(path)])); const failed = runOwner();
      assert.notEqual(failed.status, 0, `${mode}: ${failed.stdout}\n${failed.stderr}`); assert.match(`${failed.stdout}${failed.stderr}`, expectedMessage);
      for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes, `${mode} changed private state`);
      assert.doesNotMatch(readFileSync(marker, "utf8"), /create-multipart-upload|put-object(?:\s|$)|upload-part|complete-multipart-upload|put-object-retention/);
    }

    for (const [mode, code] of [["expired-token", "ExpiredToken"], ["access-denied", "AccessDenied"], ["validation-error", "ValidationError"], ["enhanced", "NoSuchUpload"], ["warning", "ExpiredToken"], ["retry-wrapper", "ExpiredToken"], ["blank", "unavailable"], ["ambiguous", "ambiguous"]]) {
      reset(mode); const before = new Map([...initialStates.keys()].map((path) => [path, readFileSync(path)])); const failed = runOwner(); const output = `${failed.stdout}${failed.stderr}`;
      assert.equal(failed.status, 70, `${mode}: ${output}`); assert.match(output, new RegExp(`stage=ListParts; awsErrorCode=${code}`)); assert.match(output, /diagnosticCategory=(?:provider-error-unparsed|cli-usage|credentials|network|timeout|process|unavailable); cliExit=(?:1|2|130|252|253|254|255|other)/);
      assert.doesNotMatch(output, /saved-upload|sidecar-version|should-not-be-rendered|proxy denied|Invalid length|provided token/i);
      assert.equal(output.includes(fixture.destination.bucket), false); for (const artifact of fixture.artifacts) { assert.equal(output.includes(artifact.payloadKey), false); assert.equal(output.includes(artifact.manifestKey), false); }
      for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes, `${mode} changed private state`);
      assert.doesNotMatch(readFileSync(marker, "utf8"), /create-multipart-upload|put-object(?:\s|$)|upload-part|complete-multipart-upload|put-object-retention/);
    }

    for (const [mode, category, exitClass, secret] of [["cli-usage", "cli-usage", "252", "private-example"], ["credentials-error", "credentials", "253", "PRIVATE-CREDENTIAL-MARKER"], ["network-error", "network", "255", "PRIVATE-ENDPOINT-MARKER"], ["timeout-error", "timeout", "255", "PRIVATE-TIMEOUT-MARKER"], ["process-error", "process", "255", "PRIVATE-PROCESS-MARKER"]]) {
      reset(mode); const before = new Map([...initialStates.keys()].map((path) => [path, readFileSync(path)])); const failed = runOwner(); const output = `${failed.stdout}${failed.stderr}`;
      assert.equal(failed.status, 70, `${mode}: ${output}`); assert.match(output, new RegExp(`stage=ListParts; awsErrorCode=unavailable; diagnosticCategory=${category}; cliExit=${exitClass}`)); assert.equal(output.toLowerCase().includes(secret.toLowerCase()), false);
      for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes, `${mode} changed private state`);
      assert.doesNotMatch(readFileSync(marker, "utf8"), /create-multipart-upload|put-object(?:\s|$)|upload-part|complete-multipart-upload|put-object-retention/);
    }

    for (const [mode, code, secrets] of [["identifier-token", "unavailable", ["AKIAEXAMPLECREDENTIAL"]], ["overlength-token", "unavailable", ["ThisTokenNameIsDeliberatelyLongerThanSixtyFourCharactersAndMustNeverBeRendered12345"]], ["punctuation-token", "unavailable", ["AccessDenied:secret"]], ["case-token", "unavailable", ["accessdenied"]], ["mixed-token", "ambiguous", ["ExpiredToken", "AKIAEXAMPLECREDENTIAL"]]]) {
      reset(mode); const before = new Map([...initialStates.keys()].map((path) => [path, readFileSync(path)])); const failed = runOwner(); const output = `${failed.stdout}${failed.stderr}`;
      assert.equal(failed.status, 70, `${mode}: ${output}`); assert.match(output, new RegExp(`stage=ListParts; awsErrorCode=${code}`)); for (const secret of secrets) assert.equal(output.includes(secret), false);
      for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes, `${mode} changed private state`);
      assert.doesNotMatch(readFileSync(marker, "utf8"), /create-multipart-upload|put-object(?:\s|$)|upload-part|complete-multipart-upload|put-object-retention/);
    }

    reset("normal"); const firstPath = [...initialStates.keys()][0]; const missingSidecar = JSON.parse(initialStates.get(firstPath)); missingSidecar.sidecarVersionId = null; const missingSidecarBytes = `${JSON.stringify(missingSidecar)}\n`; writeFileSync(firstPath, missingSidecarBytes, { mode: 0o600 });
    const missing = runOwner(); assert.equal(missing.status, 75); assert.match(`${missing.stdout}${missing.stderr}`, /lacks its exact accepted sidecar version/); assert.equal(readFileSync(firstPath, "utf8"), missingSidecarBytes); assert.doesNotMatch(readFileSync(marker, "utf8"), /s3api:(?:list-parts|head-object|create-multipart-upload|put-object|upload-part|complete-multipart-upload)/);

    reset("wrong-retention"); const wrongTime = runOwner(); assert.equal(wrongTime.status, 70); assert.match(`${wrongTime.stdout}${wrongTime.stderr}`, /retention read-back mismatch/); assert.doesNotMatch(readFileSync(marker, "utf8"), /create-multipart-upload|put-object(?:\s|$)|upload-part|complete-multipart-upload/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("owner-local runner accepts an approved-account MFA path and pins the exact post-MFA operator", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-mfa-path-"));
  try {
    const marker = writeQcFakeTools(dir, { serial: "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" });
    const run = runQcPty(dir);
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Sidecar upload failed/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts:get-caller-identity", "configure:get", "sts:assume-role", "s3api:put-object"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("empty, malformed, and wrong-account MFA serials stop before STS or storage", () => {
  for (const serial of ["", "not-an-arn", "arn:aws:iam::999999999999:mfa/witness-tree/archive-operator.device"]) {
    const dir = mkdtempSync(join(tmpdir(), "qc-promotion-mfa-rejection-"));
    try {
      const marker = writeQcFakeTools(dir, { serial });
      const run = runQcPty(dir);
      assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Configured MFA serial is absent, malformed, or outside the approved account/);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
      assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts:get-caller-identity", "configure:get"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("a valid MFA device cannot substitute another post-MFA principal", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-identity-rejection-"));
  try {
    const marker = writeQcFakeTools(dir, { serial: "arn:aws:iam::286853118812:mfa/alternate-device", identity: { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/OtherUser" } });
    const run = runQcPty(dir);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /not the exact approved operator/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts:get-caller-identity"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
