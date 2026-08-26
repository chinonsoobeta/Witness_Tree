import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sourcePlan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const scriptPath = new URL("../scripts/reconcile-qc-ecoforest-completed-object.sh", import.meta.url).pathname;
const directMfaHelper = readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8");
const repositoryRoot = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

function composite(content, partSize = 134217728) {
  const digests = [];
  for (let offset = 0; offset < content.length; offset += partSize) digests.push(createHash("sha256").update(content.subarray(offset, offset + partSize)).digest());
  return `${createHash("sha256").update(Buffer.concat(digests)).digest("base64")}-${digests.length}`;
}

function fixture(mode = "success") {
  const dir = mkdtempSync(join(tmpdir(), "qc-ecoforest-reconcile-"));
  const plan = structuredClone(sourcePlan);
  const artifact = plan.artifacts[0];
  const content = Buffer.from("approved-ecoforest-payload");
  const relative = "raw/qc-test/approved-ecoforest.bin";
  const dataRoot = join(dir, "data");
  const stateRoot = join(dir, "state");
  const dataFile = join(dataRoot, relative);
  mkdirSync(join(dataRoot, "raw/qc-test"), { recursive: true });
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  writeFileSync(dataFile, content, { mode: 0o600 });
  artifact.localPath = relative;
  artifact.byteLength = content.length;
  artifact.sha256 = createHash("sha256").update(content).digest("hex");
  const expectedComposite = composite(content);
  const stateDir = join(stateRoot, `${artifact.id}-${artifact.sha256}`);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const statePath = join(stateDir, "state.json");
  const state = {
    artifactId: artifact.id,
    payloadKey: artifact.payloadKey,
    manifestKey: artifact.manifestKey,
    sha256: artifact.sha256,
    byteLength: artifact.byteLength,
    partSizeBytes: 134217728,
    initiation: "accepted",
    uploadId: "saved-upload-id",
    payloadVersionId: null,
    compositeChecksumSha256: null,
    sidecarVersionId: "saved-sidecar-version",
  };
  const stateBytes = `${JSON.stringify(state)}\n`;
  writeFileSync(statePath, stateBytes, { mode: 0o600 });
  const planPath = join(dir, "plan.json");
  const markerPath = join(dir, "aws-calls");
  writeFileSync(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 });

  const currentHead = JSON.stringify({ VersionId: "version-1", ContentLength: content.length, ChecksumType: "COMPOSITE", ChecksumSHA256: expectedComposite });
  const exactHead = mode === "exact-mismatch"
    ? JSON.stringify({ VersionId: "version-1", ContentLength: content.length, ChecksumType: "COMPOSITE", ChecksumSHA256: "wrong-checksum" })
    : currentHead;
  const retention = mode === "retention-bad"
    ? JSON.stringify({ Retention: { Mode: "GOVERNANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } })
    : JSON.stringify({ Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } });
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, `#!/bin/zsh
print -r -- "$*" >> ${JSON.stringify(markerPath)}
case "$1:$2" in
  configure:get) print -r -- 'arn:aws:iam::286853118812:mfa/test-device' ;;
  sts:get-session-token) print -r -- '{"Credentials":{"AccessKeyId":"dummy-access","SecretAccessKey":"dummy-secret","SessionToken":"dummy-session"}}' ;;
  sts:get-caller-identity) print -r -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -r -- '{"Credentials":{"AccessKeyId":"role-access","SecretAccessKey":"role-secret","SessionToken":"role-session"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeQcArchivePromotionUploader/reconciliation"}}' ;;
  s3api:head-object)
    if [[ "$*" == *"--version-id"* ]]; then print -r -- ${JSON.stringify(exactHead)}; else print -r -- ${JSON.stringify(currentHead)}; fi
    if [[ "${mode}" == "race-head" ]]; then print -r -- '{"tampered":true}' > ${JSON.stringify(statePath)}; fi
    ;;
  s3api:put-object-retention)
    [[ "${mode}" == "put-fails" ]] && exit 42
    if [[ "${mode}" == "race-after-put" ]]; then print -r -- '{"tampered":true}' > ${JSON.stringify(statePath)}; fi
    ;;
  s3api:get-object-retention)
    print -r -- ${JSON.stringify(retention)}
    if [[ "${mode}" == "race-after-get" ]]; then print -r -- '{"tampered":true}' > ${JSON.stringify(statePath)}; fi
    ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });

  const runnerPath = join(dir, "runner.sh");
  const source = readFileSync(scriptPath, "utf8")
    .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
    .replace(/^PLAN=.*$/m, `PLAN=${JSON.stringify(planPath)}`)
    .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(dataRoot)}`)
    .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(stateRoot)}`)
    .replace(/^EXPECTED_PAYLOAD_KEY=.*$/m, `EXPECTED_PAYLOAD_KEY=${JSON.stringify(artifact.payloadKey)}`)
    .replace(/^EXPECTED_MANIFEST_KEY=.*$/m, `EXPECTED_MANIFEST_KEY=${JSON.stringify(artifact.manifestKey)}`)
    .replace(/^EXPECTED_SOURCE_RELATIVE=.*$/m, `EXPECTED_SOURCE_RELATIVE=${JSON.stringify(relative)}`)
    .replace(/^EXPECTED_SOURCE_BYTES=.*$/m, `EXPECTED_SOURCE_BYTES=${artifact.byteLength}`)
    .replace(/^EXPECTED_SOURCE_SHA=.*$/m, `EXPECTED_SOURCE_SHA=${JSON.stringify(artifact.sha256)}`);
  writeFileSync(runnerPath, source, { mode: 0o700 });
  writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
  chmodSync(runnerPath, 0o700);
  return { dir, state, stateBytes, statePath, markerPath, expectedComposite, runnerPath };
}

function runFixture(fixtureRecord) {
  const program = `set timeout 30
set env(PATH) ${JSON.stringify(`${fixtureRecord.dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(fixtureRecord.runnerPath)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${fixtureRecord.dir}:${process.env.PATH}` } });
}

function calls(record) {
  return readFileSync(record.markerPath, "utf8").trim().split("\n").filter(Boolean);
}

function s3Calls(record) {
  return calls(record).filter((call) => call.startsWith("s3api "));
}

test("bounded reconciler has only the approved exact-object operations and no broad mutation paths", () => {
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /head-object/);
  assert.match(script, /put-object-retention/);
  assert.match(script, /get-object-retention/);
  assert.match(script, /RETENTION_READBACK_VERIFIED=true[\s\S]*state_temp/);
  assert.doesNotMatch(script, /aws\s+(?:s3api\s+)?(?:put-object\s|upload-part\b|create-multipart|complete-multipart|list-parts|abort-multipart|delete-object|put-object-legal-hold|bypass-governance)/i);
  assert.doesNotMatch(script, /qc-original-current-inventory|qc-original-inventory/);
  assert.match(script, /only the two proved fields|RETENTION_READBACK_VERIFIED=true[\s\S]*state_temp/i);
});

test("successful reconciliation updates only the two proved fields after exact retention read-back", () => {
  const record = fixture();
  try {
    const run = runFixture(record);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const updated = JSON.parse(readFileSync(record.statePath, "utf8"));
    assert.equal(updated.payloadVersionId, "version-1");
    assert.equal(updated.compositeChecksumSha256, record.expectedComposite);
    assert.equal(updated.artifactId, record.state.artifactId);
    assert.equal(updated.payloadKey, record.state.payloadKey);
    assert.equal(updated.manifestKey, record.state.manifestKey);
    assert.equal(updated.sha256, record.state.sha256);
    assert.equal(updated.byteLength, record.state.byteLength);
    assert.equal(updated.partSizeBytes, record.state.partSizeBytes);
    assert.equal(updated.initiation, record.state.initiation);
    assert.equal(updated.uploadId, record.state.uploadId);
    assert.equal(updated.sidecarVersionId, record.state.sidecarVersionId);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api head-object")).length, 2);
    assert.equal(s3.filter((call) => call.startsWith("s3api put-object-retention")).length, 1);
    assert.equal(s3.filter((call) => call.startsWith("s3api get-object-retention")).length, 1);
    assert.ok(s3.every((call) => call.includes(record.state.payloadKey)));
    assert.doesNotMatch(run.stdout + run.stderr, /version-1|wrong-checksum|[A-Za-z0-9+/=]+-1/);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

test("exact-version mismatch stops before retention and preserves state bytes", () => {
  const record = fixture("exact-mismatch");
  try {
    const run = runFixture(record);
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout + run.stderr, /no retention operation was attempted/i);
    assert.equal(readFileSync(record.statePath, "utf8"), record.stateBytes);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api head-object")).length, 2);
    assert.equal(s3.some((call) => call.startsWith("s3api put-object-retention")), false);
    assert.equal(s3.some((call) => call.startsWith("s3api get-object-retention")), false);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

test("retention read-back mismatch leaves state unchanged", () => {
  const record = fixture("retention-bad");
  try {
    const run = runFixture(record);
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout + run.stderr, /private state was not updated/i);
    assert.equal(readFileSync(record.statePath, "utf8"), record.stateBytes);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api head-object")).length, 2);
    assert.equal(s3.filter((call) => call.startsWith("s3api put-object-retention")).length, 1);
    assert.equal(s3.filter((call) => call.startsWith("s3api get-object-retention")).length, 1);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

test("an unsuccessful retention application leaves state unchanged and performs no read-back", () => {
  const record = fixture("put-fails");
  try {
    const run = runFixture(record);
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout + run.stderr, /private state was not updated/i);
    assert.equal(readFileSync(record.statePath, "utf8"), record.stateBytes);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api head-object")).length, 2);
    assert.equal(s3.filter((call) => call.startsWith("s3api put-object-retention")).length, 1);
    assert.equal(s3.some((call) => call.startsWith("s3api get-object-retention")), false);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

test("a pre-existing different version or checksum blocks retention", () => {
  const record = fixture();
  try {
    const changed = { ...record.state, payloadVersionId: "different-version" };
    writeFileSync(record.statePath, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
    const stateBefore = readFileSync(record.statePath, "utf8");
    const run = runFixture(record);
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout + run.stderr, /no retention operation was attempted/i);
    assert.equal(readFileSync(record.statePath, "utf8"), stateBefore);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api head-object")).length, 2);
    assert.equal(s3.some((call) => call.startsWith("s3api put-object-retention")), false);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

test("a private-state race after retention read-back is reported without a state update", () => {
  const record = fixture("race-after-get");
  try {
    const run = runFixture(record);
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout + run.stderr, /retention may have been applied|private state changed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /version-1|wrong-checksum/);
    const s3 = s3Calls(record);
    assert.equal(s3.filter((call) => call.startsWith("s3api put-object-retention")).length, 1);
    assert.equal(s3.filter((call) => call.startsWith("s3api get-object-retention")).length, 1);
    assert.equal(JSON.parse(readFileSync(record.statePath, "utf8")).tampered, true);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});
