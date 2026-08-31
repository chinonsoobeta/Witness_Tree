import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canopyRecoveryIamAttestation,
  canopyRecovery,
  desiredIamDelta,
  desiredRecoveryRetentionDelta,
  validateCanopyRecoveryApproval,
  validateCanopyRecoveryHeads,
  validateCanopyRecoveryIam,
  validateCanopyRecoveryIamAttestation,
  validateCanopyRecoveryReadbackProvisioningPolicy,
  validateCanopyRecoveryRetention,
  validateCanopyRecoveryRetentionProvisioningPolicy,
  validateCanopyRecoveryState,
  validateCanopyRecoveryVersionReferences
} from "../scripts/check-phase1-canopy-completion-recovery.mjs";

const runnerPath = new URL("../scripts/run-phase1-canopy-completion-recovery.sh", import.meta.url).pathname;
const provisionerPath = new URL("../scripts/provision-phase1-canopy-recovery-iam.mjs", import.meta.url).pathname;

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
    retention: { mode: "COMPLIANCE", retainUntil: canopyRecovery.retainUntil, payloadsAndSidecars: true },
    steps: [...canopyRecovery.requiredSteps],
    exclusions: [...canopyRecovery.requiredExclusions],
    productionEligible: false,
    phase2: false
  };
}

function policy(includeDelta = true, includeRecoveryRetention = true) {
  const statements = [
    {
      Sid: "PayloadRetentionOnly",
      Effect: "Allow",
      Action: ["s3:GetObjectRetention", "s3:PutObjectRetention"],
      Resource: includeRecoveryRetention ? [...desiredIamDelta.requiredExistingRetention.resources] : desiredIamDelta.requiredExistingRetention.resources.slice(0, 2)
    }
  ];
  if (includeDelta) statements.push({ Sid: desiredIamDelta.delta.sid, Effect: desiredIamDelta.delta.effect, Action: [...desiredIamDelta.delta.actions], Resource: [...desiredIamDelta.delta.resources] });
  if (includeRecoveryRetention) statements.push({
    Sid: desiredRecoveryRetentionDelta.delta.sid,
    Effect: desiredRecoveryRetentionDelta.delta.effect,
    Action: [...desiredRecoveryRetentionDelta.delta.actions],
    Resource: [...desiredRecoveryRetentionDelta.delta.resources]
  });
  return { Version: "2012-10-17", Statement: statements };
}

function attestation({ applied = true } = {}) {
  return {
    schemaVersion: canopyRecoveryIamAttestation.schemaVersion,
    status: applied ? "applied" : "planned",
    applied,
    account: canopyRecovery.account,
    role: canopyRecovery.role,
    profile: canopyRecovery.profile,
    region: canopyRecovery.region,
    policyName: canopyRecoveryIamAttestation.policyName,
    basePolicySha256: "a".repeat(64),
    desiredPolicySha256: "b".repeat(64),
    readbackPolicySha256: applied ? "b".repeat(64) : null,
    preservation: "passed",
    noCredentials: true,
    noObjectVersionIds: true,
    noUploadIds: true,
    delta: structuredClone(canopyRecoveryIamAttestation.delta),
    readbackCorrection: structuredClone(canopyRecoveryIamAttestation.readbackCorrection),
    accessAnalyzer: { status: applied ? "passed" : "unavailable", findings: 0 },
    simulations: desiredRecoveryRetentionDelta.simulations.map((simulation) => ({
      ...simulation,
      decision: applied ? simulation.decision : "unavailable"
    }))
  };
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
  validateCanopyRecoveryReadbackProvisioningPolicy(policy(true, false));
  validateCanopyRecoveryRetentionProvisioningPolicy(policy());
  validateCanopyRecoveryIamAttestation(attestation());
  validateCanopyRecoveryHeads(heads(), { payloadBytes: canopyRecovery.payloadBytes, sidecarBytes: canopyRecovery.sidecarBytes });
  validateCanopyRecoveryVersionReferences(heads(), refs);
  validateCanopyRecoveryRetention({ primaryPayload: retention(), recoveryPayload: retention(), primarySidecar: retention(), recoverySidecar: retention() });
});

test("missing GetObjectVersion is rejected by the exact IAM checker", () => {
  assert.throws(() => validateCanopyRecoveryIam(policy(false)), /recovery-readback statement is absent/);
});

test("planned or altered IAM attestation is rejected for recovery", () => {
  assert.throws(() => validateCanopyRecoveryIamAttestation(attestation({ applied: false })), /applied IAM attestation/);
  const altered = attestation();
  altered.delta.resource += ".other";
  assert.throws(() => validateCanopyRecoveryIamAttestation(altered), /delta is not exact/);
});

test("root provisioning dry run validates two sequential additive statements and writes only a planned redacted attestation", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-provision-dry-run-"));
  try {
    const marker = join(dir, "calls");
    const livePolicyState = join(dir, "live-policy.json");
    const basePolicy = policy(false, false);
    const awsPath = join(dir, "aws");
    const fake = [
      "#!/bin/zsh",
      `print -r -- "$*" >> ${JSON.stringify(marker)}`,
      "case \"$1:$2\" in",
      `  sts:get-caller-identity) print -r -- ${JSON.stringify(JSON.stringify({ Account: canopyRecovery.account, Arn: `arn:aws:iam::${canopyRecovery.account}:root` }))} ;;`,
      `  iam:get-role-policy) if [[ -f ${JSON.stringify(livePolicyState)} ]]; then command cat ${JSON.stringify(livePolicyState)}; else print -r -- ${JSON.stringify(JSON.stringify({ RoleName: canopyRecovery.role, PolicyName: desiredRecoveryRetentionDelta.policyName, PolicyDocument: basePolicy }))}; fi ;;`,
      "  iam:put-role-policy)",
      "    policy_uri=''",
      "    for ((index=1; index <= $#; index++)); do if [[ \"${@[$index]}\" == '--policy-document' ]]; then next=$((index + 1)); policy_uri=\"${@[$next]}\"; fi; done",
      "    [[ \"$policy_uri\" == file://* ]] || exit 98",
      `    jq -n --arg role ${JSON.stringify(canopyRecovery.role)} --arg policy ${JSON.stringify(desiredRecoveryRetentionDelta.policyName)} --argjson document "$(<"\${policy_uri#file://}")" '{RoleName:$role,PolicyName:$policy,PolicyDocument:$document}' > ${JSON.stringify(livePolicyState)}`,
      "    ;;",
      "  accessanalyzer:validate-policy) print -r -- '{\"findings\":[]}' ;;",
      "  iam:simulate-principal-policy)",
      "    if [[ \"$*\" == *s3:DeleteObject* || \"$*\" == *raw/not-approved/payload.zip* ]]; then decision=implicitDeny; else decision=allowed; fi",
      "    print -r -- \"{\\\"EvaluationResults\\\":[{\\\"EvalDecision\\\":\\\"$decision\\\"}]}\"",
      "    ;;",
      "  *) print -u2 -- 'unexpected AWS call'; exit 99 ;;",
      "esac",
      ""
    ].join("\n");
    writeFileSync(awsPath, fake, { mode: 0o700 });
    chmodSync(awsPath, 0o700);
    const attestationPath = join(dir, "attestation.json");
    const run = spawnSync(process.execPath, [provisionerPath, "--profile", "default", "--attestation", attestationPath], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const planned = JSON.parse(readFileSync(attestationPath, "utf8"));
    validateCanopyRecoveryIamAttestation(planned, { requireApplied: false });
    assert.equal(planned.applied, false);
    assert.equal(statSync(attestationPath).mode & 0o777, 0o600);
    const calls = readFileSync(marker, "utf8");
    assert.doesNotMatch(calls, /put-role-policy/);
    const appliedRun = spawnSync(process.execPath, [provisionerPath, "--profile", "default", "--attestation", attestationPath, "--apply"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
    });
    assert.equal(appliedRun.status, 0, appliedRun.stdout + appliedRun.stderr);
    const applied = JSON.parse(readFileSync(attestationPath, "utf8"));
    validateCanopyRecoveryIamAttestation(applied);
    assert.equal(readFileSync(marker, "utf8").match(/put-role-policy/g)?.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("root provisioning removes only the legacy readback MFA condition in place", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-condition-removal-"));
  try {
    const marker = join(dir, "calls");
    const livePolicyState = join(dir, "live-policy.json");
    const legacy = policy();
    legacy.Statement.find(({ Sid }) => Sid === desiredIamDelta.delta.sid).Condition = structuredClone(desiredIamDelta.authorizedConditionRemoval);
    writeFileSync(livePolicyState, JSON.stringify({ RoleName: canopyRecovery.role, PolicyName: desiredRecoveryRetentionDelta.policyName, PolicyDocument: legacy }));
    const awsPath = join(dir, "aws");
    const fake = [
      "#!/bin/zsh",
      `print -r -- "$*" >> ${JSON.stringify(marker)}`,
      "case \"$1:$2\" in",
      `  sts:get-caller-identity) print -r -- ${JSON.stringify(JSON.stringify({ Account: canopyRecovery.account, Arn: `arn:aws:iam::${canopyRecovery.account}:root` }))} ;;`,
      `  iam:get-role-policy) command cat ${JSON.stringify(livePolicyState)} ;;`,
      "  iam:put-role-policy)",
      "    for ((index=1; index <= $#; index++)); do if [[ \"${@[$index]}\" == '--policy-document' ]]; then next=$((index + 1)); policy_uri=\"${@[$next]}\"; fi; done",
      `    jq -n --arg role ${JSON.stringify(canopyRecovery.role)} --arg policy ${JSON.stringify(desiredRecoveryRetentionDelta.policyName)} --argjson document "$(<"\${policy_uri#file://}")" '{RoleName:$role,PolicyName:$policy,PolicyDocument:$document}' > ${JSON.stringify(livePolicyState)}`,
      "    ;;",
      "  accessanalyzer:validate-policy) print -r -- '{\"findings\":[]}' ;;",
      "  iam:simulate-principal-policy)",
      "    if [[ \"$*\" == *s3:DeleteObject* || \"$*\" == *raw/not-approved/payload.zip* ]]; then decision=implicitDeny; else decision=allowed; fi",
      "    print -r -- \"{\\\"EvaluationResults\\\":[{\\\"EvalDecision\\\":\\\"$decision\\\"}]}\"",
      "    ;;",
      "  *) exit 99 ;;",
      "esac"
    ].join("\n");
    writeFileSync(awsPath, fake, { mode: 0o700 });
    chmodSync(awsPath, 0o700);
    const attestationPath = join(dir, "attestation.json");
    const run = spawnSync(process.execPath, [provisionerPath, "--profile", "default", "--attestation", attestationPath, "--apply"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const finalPolicy = JSON.parse(readFileSync(livePolicyState, "utf8")).PolicyDocument;
    validateCanopyRecoveryIam(finalPolicy);
    assert.equal(finalPolicy.Statement.find(({ Sid }) => Sid === desiredIamDelta.delta.sid).Condition, undefined);
    assert.equal(readFileSync(marker, "utf8").match(/put-role-policy/g)?.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  assert.throws(() => validateCanopyRecoveryRetention({ primaryPayload: {}, recoveryPayload: retention(), primarySidecar: retention(), recoverySidecar: retention() }), /COMPLIANCE/);
});

function writeFixture(dir) {
  const approvalPath = join(dir, "approval.json");
  const statePath = join(dir, "state.json");
  const attestationPath = join(dir, "attestation.json");
  writeFileSync(approvalPath, JSON.stringify(approval()) + "\n", { mode: 0o600 });
  writeFileSync(statePath, JSON.stringify(state()) + "\n", { mode: 0o600 });
  writeFileSync(attestationPath, JSON.stringify(attestation()) + "\n", { mode: 0o600 });
  chmodSync(approvalPath, 0o600);
  chmodSync(statePath, 0o600);
  chmodSync(attestationPath, 0o600);
  return { approvalPath, statePath, attestationPath };
}

function writeFakeAws(dir, policyDocument, { retentionNever = false, assumeRoleFails = false } = {}) {
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
    "  sts:assume-role)",
    "    if [[ \"__ASSUME_ROLE_FAILS__\" == \"true\" ]]; then",
    "      print -u2 -- \"An error occurred (AccessDenied) when calling the AssumeRole operation: exact safe diagnostic\"",
    "      exit 1",
    "    fi",
    "    print -r -- \"{\\\"Credentials\\\":{\\\"AccessKeyId\\\":\\\"test-access\\\",\\\"SecretAccessKey\\\":\\\"test-secret\\\",\\\"SessionToken\\\":\\\"test-session\\\",\\\"Expiration\\\":\\\"2099-01-01T00:00:00Z\\\"},\\\"AssumedRoleUser\\\":{\\\"Arn\\\":\\\"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/test\\\"}}\"",
    "    ;;",
    "  sts:get-caller-identity) if [[ \"$*\" == *--query* ]]; then print -r -- '286853118812'; else print -r -- '{\"Account\":\"286853118812\",\"Arn\":\"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator\"}'; fi ;;",
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
    .replaceAll("__ASSUME_ROLE_FAILS__", JSON.stringify(assumeRoleFails ? "true" : "false"))
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

test("preflight accepts only an applied attestation and makes no AWS call", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-iam-negative-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy());
    writeFileSync(fixture.attestationPath, JSON.stringify(attestation({ applied: false })) + "\n", { mode: 0o600 });
    const run = spawnSync("zsh", [runnerPath, "--preflight", fixture.approvalPath, fixture.statePath, fixture.attestationPath], { encoding: "utf8", env: { ...process.env, PATH: dir + ":" + process.env.PATH } });
    assert.equal(run.status, 65, run.stderr);
    assert.match(run.stderr, /attestation failed closed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /Current MFA TOTP|123456/);
    assert.equal(existsSync(fake.marker), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preflight refuses a shortened private checkpoint before any AWS call", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-partial-checkpoint-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy());
    const partial = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    partial.parts.pop();
    writeFileSync(fixture.statePath, JSON.stringify(partial) + "\n", { mode: 0o600 });
    chmodSync(fixture.statePath, 0o600);

    const run = spawnSync("zsh", [runnerPath, "--preflight", fixture.approvalPath, fixture.statePath, fixture.attestationPath], {
      encoding: "utf8",
      env: { ...process.env, PATH: dir + ":" + process.env.PATH }
    });

    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /private state failed closed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /Current MFA TOTP/);
    assert.equal(existsSync(fake.marker), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PTY recovery succeeds with exact heads and retention while making no unrelated storage call", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-success-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy());
    const run = runPty(["--recover-canopy", fixture.approvalPath, fixture.statePath, fixture.attestationPath], dir);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Canopy post-completion recovery completed/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|payload-version|sidecar-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("sts get-session-token")).length, 0);
    assert.equal(calls.filter((call) => call.includes("sts assume-role") && call.includes("--serial-number") && call.includes("--token-code")).length, 1);
    assert.equal(calls.filter((call) => call.includes("--role-arn arn:aws:iam::286853118812:role/WitnessTreeArchivePromotionUploader")).length, 1);
    assert.equal(calls.filter((call) => call.includes("put-object-retention")).length, 4);
    assert.equal(calls.filter((call) => call.includes("head-object")).length, 12);
    assert.ok(calls.every((call) => !call.startsWith("iam ")));
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
    const run = runPty(["--recover-canopy", fixture.approvalPath, fixture.statePath, fixture.attestationPath], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /retention readback failed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|payload-version|sidecar-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("put-object-retention")).length, 4);
    assert.ok(calls.every((call) => !/complete-multipart|upload-part|put-object --|delete-object|legal-hold|bypass-governance/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("role assumption failure exposes only the sanitized AWS error and makes no storage call", () => {
  const dir = mkdtempSync(join(tmpdir(), "canopy-recovery-sts-negative-"));
  try {
    const fixture = writeFixture(dir);
    const fake = writeFakeAws(dir, policy(), { assumeRoleFails: true });
    const run = runPty(["--recover-canopy", fixture.approvalPath, fixture.statePath, fixture.attestationPath], dir);
    assert.equal(run.status, 77, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /Direct MFA role assumption failed/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|test-access|test-secret|test-session/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.startsWith("s3api ")).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
