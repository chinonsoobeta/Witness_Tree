import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canopyRecovery,
  desiredIamDelta,
  validateCanopyRecoveryApproval,
  validateCanopyRecoveryHeads,
  validateCanopyRecoveryIam,
  validateCanopyRecoveryRetention,
  validateCanopyRecoveryState,
  validateCanopyRecoveryVersionReferences
} from "../scripts/check-phase1-canopy-completion-recovery.mjs";

const runnerPath = new URL("../scripts/run-phase1-canopy-completion-recovery.sh", import.meta.url).pathname;

function state(versionRefs) {
  const parts = Array.from({ length: canopyRecovery.partCount }, (_, index) => ({
    PartNumber: index + 1,
    ETag: "\"etag-" + (index + 1) + "\"",
    ChecksumCRC64NVME: "AAAAAAAAAAA=",
    Size: index + 1 === canopyRecovery.partCount ? canopyRecovery.payloadBytes - canopyRecovery.partSize * (canopyRecovery.partCount - 1) : canopyRecovery.partSize
  }));
  return {
    schemaVersion: 1,
    bucket: canopyRecovery.primary.bucket,
    region: canopyRecovery.region,
    key: canopyRecovery.primary.payloadKey,
    uploadId: "private-upload-id-that-is-never-printed",
    partSize: canopyRecovery.partSize,
    parts,
    ...(versionRefs ? { versionRefs } : {})
  };
}

function approval() {
  return {
    schemaVersion: canopyRecovery.schemaVersion,
    approved: true,
    account: canopyRecovery.account,
    role: canopyRecovery.role,
    profile: canopyRecovery.profile,
    region: canopyRecovery.region,
    primary: { bucket: canopyRecovery.primary.bucket, payloadKey: canopyRecovery.primary.payloadKey, sidecarKey: canopyRecovery.primary.sidecarKey },
    recovery: { bucket: canopyRecovery.recovery.bucket, payloadKey: canopyRecovery.recovery.payloadKey, sidecarKey: canopyRecovery.recovery.sidecarKey },
    retention: { mode: "COMPLIANCE", retainUntil: canopyRecovery.retainUntil, payloadsOnly: true },
    steps: [...canopyRecovery.requiredSteps],
    exclusions: [...canopyRecovery.requiredExclusions],
    productionEligible: false,
    phase2: false
  };
}

function policy(includeDelta = true) {
  const statements = [
    {
      Sid: "PayloadRetentionOnly",
      Effect: "Allow",
      Action: ["s3:GetObjectRetention", "s3:PutObjectRetention"],
      Resource: [...desiredIamDelta.requiredExistingRetention.resources]
    }
  ];
  if (includeDelta) statements.push({ Sid: desiredIamDelta.delta.sid, Effect: desiredIamDelta.delta.effect, Action: [...desiredIamDelta.delta.actions], Resource: [...desiredIamDelta.delta.resources], Condition: structuredClone(desiredIamDelta.delta.condition) });
  return { Version: "2012-10-17", Statement: statements };
}

function heads() {
  return {
    primaryPayload: { VersionId: "primary-payload-version", ContentLength: canopyRecovery.payloadBytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=" },
    recoveryPayload: { VersionId: "recovery-payload-version", ContentLength: canopyRecovery.payloadBytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=" },
    primarySidecar: { VersionId: "primary-sidecar-version", ContentLength: canopyRecovery.sidecarBytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "BBBBBBBBBBB=" },
    recoverySidecar: { VersionId: "recovery-sidecar-version", ContentLength: canopyRecovery.sidecarBytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "BBBBBBBBBBB=" }
  };
}

function retention() {
  return { Retention: { Mode: "COMPLIANCE", RetainUntilDate: canopyRecovery.retainUntil } };
}

test("approval, complete private state, exact heads, version refs, and retention pass", () => {
  const refs = Object.fromEntries(Object.entries(heads()).map(([name, head]) => [name, head.VersionId]));
  validateCanopyRecoveryApproval(approval());
  validateCanopyRecoveryState(state(refs));
  validateCanopyRecoveryIam(policy());
  validateCanopyRecoveryHeads(heads(), { payloadBytes: canopyRecovery.payloadBytes, sidecarBytes: canopyRecovery.sidecarBytes });
  validateCanopyRecoveryVersionReferences(heads(), refs);
  validateCanopyRecoveryRetention({ primary: retention(), recovery: retention() });
});

test("missing GetObjectVersion is rejected by the exact IAM checker", () => {
  assert.throws(() => validateCanopyRecoveryIam(policy(false)), /recovery-readback statement is absent/);
});

test("wrong saved version reference is rejected without exposing the reference", () => {
  const refs = Object.fromEntries(Object.entries(heads()).map(([name, head]) => [name, head.VersionId]));
  refs.recoveryPayload = "wrong-version";
  assert.throws(() => validateCanopyRecoveryVersionReferences(heads(), refs), /does not match/);
});

test("payload checksum mismatch is rejected", () => {
  const mismatched = heads();
  mismatched.recoveryPayload.ChecksumCRC64NVME = "CCCCCCCCCCC=";
  assert.throws(() => validateCanopyRecoveryHeads(mismatched, { payloadBytes: canopyRecovery.payloadBytes, sidecarBytes: canopyRecovery.sidecarBytes }), /checksums differ/);
});

test("retention absence is rejected as an unproven postcondition", () => {
  assert.throws(() => validateCanopyRecoveryRetention({ primary: {}, recovery: retention() }), /COMPLIANCE/);
});

function writeFixture(dir) {
  const approvalPath = join(dir, "approval.json");
  const statePath = join(dir, "state.json");
  writeFileSync(approvalPath, JSON.stringify(approval()) + "\n", { mode: 0o600 });
  writeFileSync(statePath, JSON.stringify(state()) + "\n", { mode: 0o600 });
  chmodSync(approvalPath, 0o600);
  chmodSync(statePath, 0o600);
  return { approvalPath, statePath };
}

function writeFakeAws(dir, policyDocument, { retentionNever = false } = {}) {
  const marker = join(dir, "aws-calls");
  const ready = join(dir, "retention-ready");
  const policyEnvelope = JSON.stringify({ PolicyDocument: policyDocument });
  const script = [
    "#!/bin/zsh",
    "print -r -- \"$*\" >> __MARKER__",
    "case \"$1:$2\" in",
    "  configure:get) print -r -- \"arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device\" ;;",
    "  iam:list-role-policies) print -r -- \"{\\\"PolicyNames\\\":[\\\"CanopyRecoveryPolicy\\\"]}\" ;;",
    "  iam:get-role-policy) print -r -- __POLICY__ ;;",
    "  sts:get-session-token|sts:assume-role) print -r -- \"{\\\"Credentials\\\":{\\\"AccessKeyId\\\":\\\"test-access\\\",\\\"SecretAccessKey\\\":\\\"test-secret\\\",\\\"SessionToken\\\":\\\"test-session\\\",\\\"Expiration\\\":\\\"2099-01-01T00:00:00Z\\\"}}\" ;;",
    "  sts:get-caller-identity) print -r -- \"286853118812\" ;;",
    "  s3api:head-object)",
    "    if [[ \"$*\" == *manifest.json* ]]; then",
    "      print -r -- \"{\\\"VersionId\\\":\\\"sidecar-version\\\",\\\"ContentLength\\\":459,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"BBBBBBBBBBB=\\\"}\"",
    "    else",
    "      print -r -- \"{\\\"VersionId\\\":\\\"payload-version\\\",\\\"ContentLength\\\":10347564066,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"AAAAAAAAAAA=\\\"}\"",
    "    fi",
    "    ;;",
    "  s3api:get-object-retention)",
    "    if [[ \"__RETENTION_NEVER__\" == \"true\" || ! -e __READY__ ]]; then",
    "      print -u2 -- \"An error occurred (NoSuchObjectLockConfiguration)\"",
    "      exit 1",
    "    fi",
    "    print -r -- \"{\\\"Retention\\\":{\\\"Mode\\\":\\\"COMPLIANCE\\\",\\\"RetainUntilDate\\\":\\\"2033-08-12T00:00:00Z\\\"}}\"",
    "    ;;",
    "  s3api:put-object-retention)",
    "    touch __READY__",
    "    print -r -- \"{}\"",
    "    ;;",
    "  *) print -u2 -- \"unexpected AWS operation\"; exit 99 ;;",
    "esac",
    ""
  ].join("\n");
  const rendered = script
    .replaceAll("__MARKER__", JSON.stringify(marker))
    .replaceAll("__READY__", JSON.stringify(ready))
    .replaceAll("__RETENTION_NEVER__", JSON.stringify(retentionNever ? "true" : "false"))
    .replaceAll("__POLICY__", JSON.stringify(policyEnvelope));
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, rendered, { mode: 0o700 });
  chmodSync(awsPath, 0o700);
  return { marker, awsPath };
}

function runPty(args, dir) {
  const program = [
    "set timeout 45",
    "spawn -noecho zsh " + JSON.stringify(runnerPath) + " " + args.map(JSON.stringify).join(" "),
    "expect {",
    "  \"Current MFA TOTP (not stored):\" { send -- \"123456\\r\"; exp_continue }",
    "  eof { set result [wait]; exit [lindex $result 3] }",
    "  timeout { exit 2 }",
    "}"
  ].join("\n");
  return spawnSync("expect", ["-c", program], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, PATH: dir + ":" + process.env.PATH }
  });
}

test("PTY preflight stops before TOTP when GetObjectVersion is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-iam-negative-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy(false));
    const run = spawnSync("zsh", [runnerPath, "--preflight", fixture.approvalPath, fixture.statePath], { encoding: "utf8", env: { ...process.env, PATH: dir + ":" + process.env.PATH } });
    assert.equal(run.status, 65, run.stderr);
    assert.match(run.stderr, /live IAM policy does not exactly match/i);
    assert.doesNotMatch(run.stdout + run.stderr, /Current MFA TOTP|123456/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.startsWith("iam ")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PTY recovery succeeds with exact heads and retention while making no unrelated storage call", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-success-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy());
    const run = runPty(["--recover-canopy", fixture.approvalPath, fixture.statePath], dir);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Canopy post-completion recovery completed/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|payload-version|sidecar-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("put-object-retention")).length, 2);
    assert.equal(calls.filter((call) => call.includes("head-object")).length, 8);
    assert.ok(calls.every((call) => !/complete-multipart|upload-part|put-object --|delete-object|legal-hold|bypass-governance/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PTY recovery fails closed when retention remains absent after the attempted exact writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-retention-negative-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy(), { retentionNever: true });
    const run = runPty(["--recover-canopy", fixture.approvalPath, fixture.statePath], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /retention readback failed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|payload-version|sidecar-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("put-object-retention")).length, 2);
    assert.ok(calls.every((call) => !/complete-multipart|upload-part|put-object --|delete-object|legal-hold|bypass-governance/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
