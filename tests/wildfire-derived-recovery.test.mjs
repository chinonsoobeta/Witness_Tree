import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ACCOUNT,
  APPROVAL_SCHEMA,
  EVIDENCE_SCHEMA,
  REGION,
  ROLE,
  STATE_SCHEMA,
  approvalTemplate,
  buildEvidence,
  stateTemplate,
  validateEvidence,
  validateIamAttestation,
  validateState
} from "../scripts/check-wildfire-derived-recovery.mjs";
import { validate as validatePlan, manifestKey } from "../scripts/prepare-wildfire-derived-immutable-promotion.mjs";

const plan = validatePlan();
const runnerPath = new URL("../scripts/run-wildfire-derived-recovery.sh", import.meta.url).pathname;
const dataRoot = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const bucket = "witness-tree-raw-archive-ca-central-1";

function approval() {
  const value = approvalTemplate();
  value.status = "owner-approved";
  value.approved = true;
  return value;
}

function state(versionId = "bc-existing-version", checksum = "AAAAAAAAAAA=") {
  const value = stateTemplate();
  value.bcPayload.versionId = versionId;
  value.bcPayload.checksumCRC64NVME = checksum;
  return value;
}

function attestation() {
  const prefix = `arn:aws:s3:::${bucket}/`;
  const resources = plan.artifacts.flatMap((artifact) => [artifact.payloadKey, manifestKey(artifact)]).map((key) => `${prefix}${key}`);
  return {
    schemaVersion: "witness-tree/wildfire-derived-readback-iam-attestation/1",
    account: ACCOUNT,
    role: ROLE,
    policyName: "WitnessTreeWildfireDerivedExactObjects",
    profile: "default",
    region: REGION,
    status: "applied",
    applied: true,
    change: "append-versioned-readback",
    basePolicySha256: "a".repeat(64),
    desiredPolicySha256: "b".repeat(64),
    readbackPolicySha256: "c".repeat(64),
    noCredentials: true,
    noObjectVersionIds: true,
    noUploadIds: true,
    accessAnalyzer: { status: "passed", findings: 0 },
    simulations: [],
    delta: { Sid: "ExactDerivedVersionedReadbacks", Effect: "Allow", Action: ["s3:GetObjectVersion"], Resource: resources }
  };
}

function head(bytes, version, checksum = "AAAAAAAAAAA=") {
  return { VersionId: version, ContentLength: bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: checksum };
}

function retention() {
  return { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function fixture(dir) {
  const approvalPath = join(dir, "approval.json");
  const statePath = join(dir, "state.json");
  const attestationPath = join(dir, "attestation.json");
  const evidencePath = join(dir, "evidence.json");
  writeJson(approvalPath, approval());
  writeJson(statePath, state());
  writeJson(attestationPath, attestation());
  return { approvalPath, statePath, attestationPath, evidencePath };
}

function writeFakeAws(dir, { preexistingBcManifest = false, wrongBcVersion = false } = {}) {
  const marker = join(dir, "aws-calls");
  const bcRetention = join(dir, "bc-retention");
  const ontarioRetention = join(dir, "ontario-retention");
  const fake = [
    "#!/bin/zsh",
    `print -r -- "$*" >> ${JSON.stringify(marker)}`,
    "case \"$1:$2\" in",
    "  configure:get) print -r -- \"arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device\" ;;",
    "  sts:assume-role) print -r -- '{\"Credentials\":{\"AccessKeyId\":\"test-access\",\"SecretAccessKey\":\"test-secret\",\"SessionToken\":\"test-session\"}}' ;;",
    "  sts:get-caller-identity) print -r -- \"286853118812\" ;;",
    "  s3api:head-object)",
    "    if [[ \"$*\" == *bc-wildfire* && \"$*\" == *manifest.json* && \"$*\" != *--version-id* ]]; then",
    preexistingBcManifest
      ? "      print -r -- '{\"VersionId\":\"existing-bc-manifest\",\"ContentLength\":831,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'"
      : "      print -u2 -- 'An error occurred (NotFound) when calling the HeadObject operation'; exit 1",
    "    elif [[ \"$*\" == *ontario* && \"$*\" == *manifest.json* && \"$*\" != *--version-id* ]]; then",
    "      print -u2 -- 'An error occurred (NotFound) when calling the HeadObject operation'; exit 1",
    "    elif [[ \"$*\" == *ontario* && \"$*\" == *derived.gpkg* && \"$*\" != *--version-id* ]]; then",
    "      print -u2 -- 'An error occurred (NotFound) when calling the HeadObject operation'; exit 1",
    "    elif [[ \"$*\" == *bc-wildfire-216-feature-release.gpkg* ]]; then",
    wrongBcVersion
      ? "      print -r -- '{\"VersionId\":\"wrong-bc-version\",\"ContentLength\":2162688,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'"
      : "      print -r -- '{\"VersionId\":\"bc-existing-version\",\"ContentLength\":2162688,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    elif [[ \"$*\" == *bc-wildfire* && \"$*\" == *--version-id*bc-manifest-version* ]]; then",
    "      print -r -- '{\"VersionId\":\"bc-manifest-version\",\"ContentLength\":831,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    elif [[ \"$*\" == *ontario* && \"$*\" == *derived.gpkg* ]]; then",
    "      print -r -- '{\"VersionId\":\"ontario-payload-version\",\"ContentLength\":7913472,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    else",
    "      print -r -- '{\"VersionId\":\"ontario-manifest-version\",\"ContentLength\":885,\"ChecksumType\":\"FULL_OBJECT\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    fi ;;",
    "  s3api:put-object)",
    "    if [[ \"$*\" == *bc-wildfire* && \"$*\" == *manifest.json* ]]; then print -r -- '{\"VersionId\":\"bc-manifest-version\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    elif [[ \"$*\" == *derived.gpkg* ]]; then print -r -- '{\"VersionId\":\"ontario-payload-version\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    else print -r -- '{\"VersionId\":\"ontario-manifest-version\",\"ChecksumCRC64NVME\":\"AAAAAAAAAAA=\"}'",
    "    fi ;;",
    "  s3api:get-object-retention)",
    `    if [[ "$*" == *bc-wildfire* && ! -e ${JSON.stringify(bcRetention)} ]]; then print -u2 -- 'An error occurred (NoSuchObjectLockConfiguration)'; exit 1; fi`,
    `    if [[ "$*" == *ontario* && ! -e ${JSON.stringify(ontarioRetention)} ]]; then print -u2 -- 'An error occurred (NoSuchObjectLockConfiguration)'; exit 1; fi`,
    "    print -r -- '{\"Retention\":{\"Mode\":\"COMPLIANCE\",\"RetainUntilDate\":\"2033-08-12T00:00:00Z\"}}' ;;",
    "  s3api:put-object-retention)",
    `    if [[ "$*" == *bc-wildfire* ]]; then touch ${JSON.stringify(bcRetention)}; else touch ${JSON.stringify(ontarioRetention)}; fi; print -r -- '{}' ;;`,
    "  *) print -u2 -- 'unexpected AWS operation'; exit 99 ;;",
    "esac",
    ""
  ].join("\n");
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, fake, { mode: 0o700 });
  chmodSync(awsPath, 0o700);
  return { marker, awsPath };
}

function runPty(args, dir) {
  const program = [
    "set timeout 90",
    "spawn -noecho zsh " + JSON.stringify(runnerPath) + " " + args.map(JSON.stringify).join(" "),
    "expect {",
    "  \"Current MFA TOTP (not stored):\" { send -- \"123456\\r\"; exp_continue }",
    "  eof { set result [wait]; exit [lindex $result 3] }",
    "  timeout { exit 2 }",
    "}"
  ].join("\n");
  return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: dataRoot } });
}

test("recovery approval, private state, IAM attestation, and evidence are exact", () => {
  const a = approval();
  const s = state();
  const i = attestation();
  validateState(s);
  validateIamAttestation(i);
  const heads = {
    bcPayload: head(2162688, "bc-existing-version"),
    bcManifest: head(831, "bc-manifest-version"),
    ontarioPayload: head(7913472, "ontario-payload-version"),
    ontarioManifest: head(885, "ontario-manifest-version")
  };
  const evidence = buildEvidence(a, s, heads, { bcPayload: retention(), ontarioPayload: retention() });
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA);
  validateEvidence(evidence, a, s);
  assert.equal(a.schemaVersion, APPROVAL_SCHEMA);
  assert.equal(s.schemaVersion, STATE_SCHEMA);
});

test("preflight makes no AWS call and refuses an existing evidence path", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-recovery-preflight-"));
  try {
    const f = fixture(dir);
    const fake = writeFakeAws(dir);
    const run = spawnSync("zsh", [runnerPath, "--preflight", f.approvalPath, f.statePath, f.attestationPath, f.evidencePath], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: dataRoot } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /PRECHECK passed/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|bc-existing-version/);
    assert.equal(existsSync(fake.marker), false);
    writeJson(f.evidencePath, { placeholder: true });
    const blocked = spawnSync("zsh", [runnerPath, "--preflight", f.approvalPath, f.statePath, f.attestationPath, f.evidencePath], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: dataRoot } });
    assert.equal(blocked.status, 65);
    assert.match(blocked.stderr, /evidence path already exists/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recovery reuses BC payload, conditionally creates only three missing objects, and writes exact evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-recovery-success-"));
  try {
    const f = fixture(dir);
    const fake = writeFakeAws(dir);
    const run = runPty(["--recover", f.approvalPath, f.statePath, f.attestationPath, f.evidencePath], dir);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /recovery completed/i);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|bc-existing-version|bc-manifest-version|ontario-payload-version|ontario-manifest-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    const puts = calls.filter((call) => call.startsWith("s3api put-object "));
    assert.equal(puts.length, 3);
    assert.ok(puts.every((call) => call.includes("--if-none-match *") && call.includes("--checksum-algorithm CRC64NVME")));
    assert.ok(puts.every((call) => !call.includes("bc-wildfire-216-feature-release.gpkg")));
    assert.equal(calls.filter((call) => call.startsWith("s3api put-object-retention ")).length, 2);
    assert.ok(calls.every((call) => !/list-objects|upload-part|complete-multipart|delete-object|legal-hold|bypass-governance|iam /i.test(call)));
    assert.equal(statSync(f.evidencePath).mode & 0o777, 0o600);
    const evidence = JSON.parse(readFileSync(f.evidencePath, "utf8"));
    validateEvidence(evidence, approval(), state());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recovery stops before any write when the saved BC version fails exact head validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-recovery-version-negative-"));
  try {
    const f = fixture(dir);
    const fake = writeFakeAws(dir, { wrongBcVersion: true });
    const run = runPty(["--recover", f.approvalPath, f.statePath, f.attestationPath, f.evidencePath], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /saved BC payload version/i);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.startsWith("s3api put-object ")).length, 0);
    assert.equal(calls.filter((call) => call.startsWith("s3api put-object-retention ")).length, 0);
    assert.equal(existsSync(f.evidencePath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preexisting BC manifest stops before every recovery write", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-recovery-key-negative-"));
  try {
    const f = fixture(dir);
    const fake = writeFakeAws(dir, { preexistingBcManifest: true });
    const run = runPty(["--recover", f.approvalPath, f.statePath, f.attestationPath, f.evidencePath], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /preexisting-key guard/i);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.startsWith("s3api put-object ")).length, 0);
    assert.equal(calls.filter((call) => call.startsWith("s3api put-object-retention ")).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
