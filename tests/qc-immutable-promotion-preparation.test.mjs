import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { multipartPlan, partCount, sidecarFor, validateQcImmutablePromotionPreparation, writeSidecars } from "../scripts/prepare-qc-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const runnerPath = new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url).pathname;
const repositoryRoot = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

function writeQcFakeTools(dir, { serial, identity = { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" } }) {
  const marker = join(dir, "aws-calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- ${JSON.stringify(serial)} ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
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
  assert.match(runner, /PRECHECK passed[\s\S]*read -r -s/);
  assert.match(runner, /create-multipart-upload[\s\S]*upload-part[\s\S]*complete-multipart-upload/);
  assert.match(runner, /list-parts[\s\S]*Previously uploaded part does not match/);
  assert.match(runner, /ChecksumType=="COMPOSITE"[\s\S]*put-object-retention[\s\S]*get-object-retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|aws iam /i);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
  assert.match(runner, /NoSuchUpload[\s\S]*head-object[\s\S]*--version-id[\s\S]*state was preserved and no new upload was started/);
});

test("NoSuchUpload adopts only an exact completed version, preserves a mismatch, and never starts a replacement upload", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-nosuchupload-"));
  try {
    const dataRoot = join(dir, "data"); const stateRoot = join(dir, "state"); mkdirSync(dataRoot, { recursive: true }); mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    const fixture = structuredClone(plan); const composites = {}; const payloadHeads = {}; const sidecarHeads = {};
    for (const [index, artifact] of fixture.artifacts.entries()) {
      const content = Buffer.from(index ? "second-payload" : "first-payload"); const relative = `raw/qc-test/${artifact.id}.bin`; const file = join(dataRoot, relative); mkdirSync(join(dataRoot, "raw/qc-test"), { recursive: true }); writeFileSync(file, content);
      artifact.localPath = relative; artifact.byteLength = content.length; artifact.sha256 = createHash("sha256").update(content).digest("hex");
      const digests = []; for (let offset = 0; offset < content.length; offset += 4) digests.push(createHash("sha256").update(content.subarray(offset, offset + 4)).digest());
      composites[artifact.id] = `${createHash("sha256").update(Buffer.concat(digests)).digest("base64")}-${digests.length}`;
      payloadHeads[artifact.payloadKey] = { VersionId: `exact-version-${index}`, ContentLength: content.length, ChecksumType: "COMPOSITE", ChecksumSHA256: composites[artifact.id] };
      const sidecar = sidecarFor(plan, plan.artifacts[index]); sidecarHeads[artifact.manifestKey] = { VersionId: `sidecar-version-${index}`, ContentLength: Buffer.byteLength(sidecar), ChecksumSHA256: createHash("sha256").update(sidecar).digest("base64") };
      const stateDir = join(stateRoot, `${artifact.id}-${artifact.sha256}`); mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      const state = { artifactId: artifact.id, payloadKey: artifact.payloadKey, manifestKey: artifact.manifestKey, sha256: artifact.sha256, byteLength: artifact.byteLength, partSizeBytes: 4, initiation: "accepted", uploadId: `saved-upload-${index}`, payloadVersionId: null, compositeChecksumSha256: null, sidecarVersionId: `sidecar-version-${index}` };
      writeFileSync(join(stateDir, "state.json"), `${JSON.stringify(state)}\n`, { mode: 0o600 });
    }
    payloadHeads[fixture.artifacts[1].payloadKey].ChecksumSHA256 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const fixturePlan = join(dir, "plan.json"); writeFileSync(fixturePlan, `${JSON.stringify(fixture)}\n`);
    const marker = join(dir, "aws-calls"); const aws = join(dir, "aws");
    writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2 $*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- 'arn:aws:iam::286853118812:mfa/test-device' ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  s3api:list-parts) print -u2 -- 'An error occurred (NoSuchUpload) when calling the ListParts operation'; exit 254 ;;
  s3api:head-object)
    key=""; while (( $# )); do if [[ "$1" == "--key" ]]; then key="$2"; break; fi; shift; done
    case "$key" in
      ${JSON.stringify(fixture.artifacts[0].manifestKey)}) print -- ${JSON.stringify(JSON.stringify(sidecarHeads[fixture.artifacts[0].manifestKey]))} ;;
      ${JSON.stringify(fixture.artifacts[1].manifestKey)}) print -- ${JSON.stringify(JSON.stringify(sidecarHeads[fixture.artifacts[1].manifestKey]))} ;;
      ${JSON.stringify(fixture.artifacts[0].payloadKey)}) print -- ${JSON.stringify(JSON.stringify(payloadHeads[fixture.artifacts[0].payloadKey]))} ;;
      ${JSON.stringify(fixture.artifacts[1].payloadKey)}) print -- ${JSON.stringify(JSON.stringify(payloadHeads[fixture.artifacts[1].payloadKey]))} ;;
      *) exit 99 ;;
    esac ;;
  s3api:put-object-retention) print -- '{}' ;;
  s3api:get-object-retention) print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}' ;;
  *) exit 98 ;;
esac
`, { mode: 0o700 }); chmodSync(aws, 0o700);
    const source = readFileSync(runnerPath, "utf8")
      .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
      .replace(/^PLAN=.*$/m, `PLAN=${JSON.stringify(fixturePlan)}`)
      .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(dataRoot)}`)
      .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(stateRoot)}`)
      .replace(/^PART_SIZE=.*$/m, "PART_SIZE=4");
    const runner = join(dir, "runner.sh"); writeFileSync(runner, source, { mode: 0o700 });
    const program = `set timeout 30\nset env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}\nspawn -noecho zsh ${JSON.stringify(runner)} --run\nexpect {\n  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }\n  eof { set result [wait]; exit [lindex $result 3] }\n  timeout { exit 2 }\n}`;
    const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`); assert.match(run.stdout, /Recovered completed payload evidence after NoSuchUpload/); assert.match(`${run.stdout}${run.stderr}`, /current exact-key object does not match.*state was preserved and no new upload was started/i);
    const calls = readFileSync(marker, "utf8"); assert.doesNotMatch(calls, /create-multipart-upload|upload-part|complete-multipart-upload|put-object(?:\s|$)/);
    const exactArtifact = fixture.artifacts[0]; const exactState = JSON.parse(readFileSync(join(stateRoot, `${exactArtifact.id}-${exactArtifact.sha256}`, "state.json"), "utf8"));
    assert.equal(exactState.payloadVersionId, "exact-version-0"); assert.equal(exactState.compositeChecksumSha256, composites[exactArtifact.id]);
    const mismatchedArtifact = fixture.artifacts[1]; const mismatchedState = JSON.parse(readFileSync(join(stateRoot, `${mismatchedArtifact.id}-${mismatchedArtifact.sha256}`, "state.json"), "utf8"));
    assert.equal(mismatchedState.payloadVersionId, null); assert.equal(mismatchedState.compositeChecksumSha256, null); assert.equal(mismatchedState.uploadId, "saved-upload-1");
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
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get", "sts:get-session-token", "sts:get-caller-identity", "sts:assume-role", "s3api:put-object"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("empty, malformed, and wrong-account MFA serials stop before STS or storage", () => {
  for (const serial of ["", "not-an-arn", "arn:aws:iam::999999999999:mfa/witness-tree/archive-operator.device"]) {
    const dir = mkdtempSync(join(tmpdir(), "qc-promotion-mfa-rejection-"));
    try {
      const marker = writeQcFakeTools(dir, { serial });
      const run = runQcPty(dir);
      assert.equal(run.status, 69, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Configured MFA serial is absent, malformed, or outside the approved account/);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
      assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("a valid MFA device cannot substitute another post-MFA principal", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-identity-rejection-"));
  try {
    const marker = writeQcFakeTools(dir, { serial: "arn:aws:iam::286853118812:mfa/alternate-device", identity: { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/OtherUser" } });
    const run = runQcPty(dir);
    assert.equal(run.status, 77, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /not the exact approved operator identity/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get", "sts:get-session-token", "sts:get-caller-identity"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
