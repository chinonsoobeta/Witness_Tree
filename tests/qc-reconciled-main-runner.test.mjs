import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sourcePlan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const runnerPath = new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url).pathname;
const directMfaHelper = readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8");
const repositoryRoot = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

function makeFixture(mode = "success") {
  const dir = mkdtempSync(join(tmpdir(), "qc-reconciled-runner-"));
  const plan = structuredClone(sourcePlan);
  const dataRoot = join(dir, "data");
  const stateRoot = join(dir, "state");
  const markerPath = join(dir, "aws-calls");
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const states = [];
  for (const [index, artifact] of plan.artifacts.entries()) {
    const content = Buffer.from(index === 0 ? "reconciled-ecoforest-payload" : "untouched-original-inventory");
    const relative = `raw/qc-test/${artifact.id}.bin`;
    const file = join(dataRoot, relative);
    mkdirSync(join(dataRoot, "raw/qc-test"), { recursive: true });
    writeFileSync(file, content, { mode: 0o600 });
    artifact.localPath = relative;
    artifact.byteLength = content.length;
    artifact.sha256 = createHash("sha256").update(content).digest("hex");
    const stateDir = join(stateRoot, `${artifact.id}-${artifact.sha256}`);
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const statePath = join(stateDir, "state.json");
    const state = index === 0
      ? {
          artifactId: artifact.id,
          payloadKey: artifact.payloadKey,
          manifestKey: artifact.manifestKey,
          sha256: artifact.sha256,
          byteLength: artifact.byteLength,
          partSizeBytes: 4,
          initiation: "accepted",
          uploadId: "reconciled-old-upload",
          payloadVersionId: "reconciled-version",
          compositeChecksumSha256: "reconciledchecksum-1",
          sidecarVersionId: "reconciled-sidecar",
        }
      : {
          artifactId: artifact.id,
          payloadKey: artifact.payloadKey,
          manifestKey: artifact.manifestKey,
          sha256: artifact.sha256,
          byteLength: artifact.byteLength,
          partSizeBytes: 4,
          initiation: "not-started",
          uploadId: null,
          payloadVersionId: null,
          compositeChecksumSha256: null,
          sidecarVersionId: null,
        };
    const bytes = `${JSON.stringify(state)}\n`;
    writeFileSync(statePath, bytes, { mode: 0o600 });
    states.push({ artifact, state, statePath, bytes });
  }
  const planPath = join(dir, "plan.json");
  writeFileSync(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 });
  const eco = plan.artifacts[0];
  const original = plan.artifacts[1];
  const goodHead = { VersionId: "reconciled-version", ContentLength: eco.byteLength, ChecksumType: "COMPOSITE", ChecksumSHA256: "reconciledchecksum-1" };
  const exactHead = mode === "version-mismatch"
    ? { ...goodHead, VersionId: "different-version" }
    : mode === "checksum-mismatch"
      ? { ...goodHead, ChecksumSHA256: "differentchecksum-1" }
      : goodHead;
  const goodRetention = { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
  const retention = mode === "retention-mismatch"
    ? { Retention: { Mode: "GOVERNANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } }
    : goodRetention;
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, `#!/bin/zsh
print -r -- "$1:$2 $*" >> ${JSON.stringify(markerPath)}
case "$1:$2" in
  configure:get) print -r -- 'arn:aws:iam::286853118812:mfa/test-device' ;;
  sts:assume-role) print -r -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeQcArchivePromotionUploader/test"}}' ;;
  sts:get-caller-identity) print -r -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  s3api:head-object)
    key=""; version=""
    while (( $# )); do
      if [[ "$1" == "--key" ]]; then key="$2"; shift 2; elif [[ "$1" == "--version-id" ]]; then version="$2"; shift 2; else shift; fi
    done
    if [[ "$key" == ${JSON.stringify(eco.payloadKey)} ]]; then
      [[ -n "$version" ]] || exit 91
      print -r -- ${JSON.stringify(JSON.stringify(exactHead))}
    else
      exit 92
    fi
    ;;
  s3api:get-object-retention)
    print -r -- ${JSON.stringify(JSON.stringify(retention))} ;;
  s3api:put-object) exit 88 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  chmodSync(awsPath, 0o700);
  const runner = join(dir, "runner.sh");
  const source = readFileSync(runnerPath, "utf8");
  writeFileSync(runner, source
    .replace(/^ROOT=.*$/m, `ROOT=${JSON.stringify(repositoryRoot)}`)
    .replace(/^PLAN=.*$/m, `PLAN=${JSON.stringify(planPath)}`)
    .replace(/^DATA_ROOT=.*$/m, `DATA_ROOT=${JSON.stringify(dataRoot)}`)
    .replace(/^STATE_ROOT=.*$/m, `STATE_ROOT=${JSON.stringify(stateRoot)}`)
    .replace(/^PART_SIZE=.*$/m, "PART_SIZE=4"), { mode: 0o700 });
  writeFileSync(join(dir, "aws-direct-mfa-role-session.sh"), directMfaHelper, { mode: 0o700 });
  return { dir, runner, markerPath, states, eco, original };
}

function runFixture(record) {
  const program = `set timeout 30
set env(PATH) ${JSON.stringify(`${record.dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(record.runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${record.dir}:${process.env.PATH}` } });
}

function marker(record) {
  return readFileSync(record.markerPath, "utf8").trim().split("\n").filter(Boolean);
}

test("reconciled ecoforest state verifies exact version and retention, then reaches original inventory without touching its state", () => {
  const record = makeFixture();
  try {
    const run = runFixture(record);
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Reconciled ecoforest payload verified/);
    assert.match(`${run.stdout}${run.stderr}`, /Sidecar upload failed/);
    const calls = marker(record);
    assert.equal(calls.filter((call) => call.startsWith("s3api:head-object") && call.includes(record.eco.payloadKey)).length, 1);
    assert.equal(calls.filter((call) => call.startsWith("s3api:get-object-retention") && call.includes(record.eco.payloadKey)).length, 1);
    assert.equal(calls.some((call) => call.startsWith("s3api:list-parts")), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:put-object-retention")), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:create-multipart-upload")), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:upload-part")), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:complete-multipart-upload")), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:put-object") && call.includes(record.eco.payloadKey)), false);
    assert.equal(calls.some((call) => call.startsWith("s3api:put-object") && call.includes(record.original.manifestKey)), true);
    for (const state of record.states) assert.equal(readFileSync(state.statePath, "utf8"), state.bytes, `${state.artifact.id} state changed`);
  } finally {
    rmSync(record.dir, { recursive: true, force: true });
  }
});

for (const mode of ["version-mismatch", "checksum-mismatch", "retention-mismatch"]) {
  test(`reconciled ecoforest ${mode} fails closed before original inventory`, () => {
    const record = makeFixture(mode);
    try {
      const run = runFixture(record);
      assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
      const output = `${run.stdout}${run.stderr}`;
      assert.doesNotMatch(output, /Sidecar upload failed/);
      const calls = marker(record);
      assert.equal(calls.some((call) => call.startsWith("s3api:list-parts")), false);
      assert.equal(calls.some((call) => call.startsWith("s3api:put-object-retention")), false);
      assert.equal(calls.some((call) => call.startsWith("s3api:put-object") && call.includes(record.original.manifestKey)), false);
      for (const state of record.states) assert.equal(readFileSync(state.statePath, "utf8"), state.bytes, `${state.artifact.id} state changed`);
    } finally {
      rmSync(record.dir, { recursive: true, force: true });
    }
  });
}
