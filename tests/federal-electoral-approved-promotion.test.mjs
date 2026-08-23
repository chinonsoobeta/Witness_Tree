import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyFederalHeadAbsence } from "../scripts/classify-federal-head-absence.mjs";
import { validateFederalLiveIamEvidence, FEDERAL_LIVE_IAM_RAW_NAMES } from "../scripts/check-federal-electoral-live-iam-evidence.mjs";
import { loadFederalExecutionGateInputs, validateFederalExecutionGates } from "../scripts/check-federal-electoral-promotion-gates.mjs";
import { publishFederalMode600 } from "../scripts/federal-electoral-safe-publication.mjs";
import { acquireFederalRunLock, releaseFederalRunLock } from "../scripts/federal-electoral-run-lock.mjs";
import { copyStableDescriptor, verifyStableUploadDescriptor } from "../scripts/federal-electoral-stable-file.mjs";

const runner = new URL("../scripts/run-federal-electoral-approved-promotion.sh", import.meta.url).pathname;
const plan = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url)));
const desired = JSON.parse(readFileSync(new URL("../data/federal-electoral-promotion-iam-desired-state.json", import.meta.url)));
const dataRoot = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const result = (action, resource, decision) => ({ EvalActionName: action, EvalResourceName: resource, EvalDecision: decision });

function writeLiveEvidence(dir) {
  const account = desired.account;
  const roleArn = `arn:aws:iam::${account}:role/${desired.roleName}`;
  const operatorArn = `arn:aws:iam::${account}:user/${desired.operatorUser}`;
  const payload = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.payloadKey}`;
  const sidecar = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.manifestKey}`;
  const bucket = `arn:aws:s3:::${desired.bucket}`;
  const values = {
    "caller-identity.json": { Account: account, Arn: operatorArn },
    "get-role.json": { Role: { Arn: roleArn, AssumeRolePolicyDocument: desired.trustPolicy } },
    "get-role-policy.json": { RoleName: desired.roleName, PolicyDocument: desired.rolePolicy },
    "get-user-policy.json": { UserName: desired.operatorUser, PolicyDocument: desired.operatorPolicy },
    "validate-role-policy.json": { findings: [] },
    "validate-operator-policy.json": { findings: [] },
    "simulate-operator.json": { EvaluationResults: [result("sts:AssumeRole", roleArn, "allowed"), result("sts:AssumeRole", `arn:aws:iam::${account}:role/OtherRole`, "implicitDeny")] },
    "simulate-role.json": { EvaluationResults: [
      result("s3:PutObject", payload, "allowed"), result("s3:GetObject", payload, "allowed"), result("s3:GetObjectVersion", payload, "allowed"),
      result("s3:PutObject", sidecar, "allowed"), result("s3:GetObject", sidecar, "allowed"), result("s3:GetObjectVersion", sidecar, "allowed"),
      result("s3:PutObjectRetention", payload, "allowed"), result("s3:GetObjectRetention", payload, "allowed"), result("s3:ListBucketVersions", bucket, "allowed"),
      result("s3:DeleteObject", payload, "implicitDeny"), result("iam:GetRole", roleArn, "implicitDeny"), result("s3:PutObject", `arn:aws:s3:::${desired.bucket}/other`, "implicitDeny")
    ] }
  };
  const records = FEDERAL_LIVE_IAM_RAW_NAMES.map((name) => {
    const bytes = Buffer.from(`${JSON.stringify(values[name])}\n`);
    writeFileSync(join(dir, name), bytes, { mode: 0o600 });
    return { name, byteLength: bytes.length, sha256: hash(bytes) };
  });
  const manifest = { schemaVersion: "witness-tree/federal-electoral-live-iam-file-evidence/1", status: "owner-approved-live-file-evidence-complete", capturedAt: "2026-08-23T12:00:00.000Z", rawFiles: records, rawBundleSha256: hash(`${JSON.stringify(records)}\n`), claims: { livePoliciesExactlyMatchDesired: true, accessAnalyzerPassed: true, simulationsPassed: true, iamMutationPerformed: false, s3MutationPerformed: false, recoveryAuthorized: false } };
  const path = join(dir, "manifest.json");
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return path;
}

test("federal preflight is local-only and --run remains blocked", () => {
  const preflight = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, FEDERAL_DATA_ROOT: dataRoot } });
  assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
  assert.match(preflight.stdout, /no MFA, network, or external command/);
  const run = spawnSync("zsh", [runner, "--run"], { encoding: "utf8", env: { ...process.env, FEDERAL_DATA_ROOT: dataRoot } });
  assert.equal(run.status, 75);
  assert.match(`${run.stdout}${run.stderr}`, /readiness evidence is not approved|execution remains disabled/i);
  assert.doesNotMatch(readFileSync(runner, "utf8"), /\baws\b|Current MFA TOTP|put-object/);
});

test("federal absence classifier rejects ambiguous provider-shaped text", () => {
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found"), "absent");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found\nAn error occurred (AccessDenied)"), "ambiguous");
});

test("owner-only run lock is exclusive, durable, and inode-bound on release", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-lock-")); const lockPath = join(dir, "run.lock"); const tombstone = join(dir, "release");
  try {
    const lock = acquireFederalRunLock(lockPath);
    assert.throws(() => acquireFederalRunLock(lockPath), /EEXIST/);
    assert.equal((lstatSync(lockPath).mode & 0o777), 0o700);
    assert.equal(releaseFederalRunLock(lock, tombstone), true);
    assert.equal(existsSync(lockPath), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run-lock release never deletes a rename-swapped replacement", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-lock-swap-")); const lockPath = join(dir, "run.lock"); const moved = join(dir, "owned"); const replacement = join(dir, "replacement"); const tombstone = join(dir, "release");
  try {
    const lock = acquireFederalRunLock(lockPath); mkdirSync(replacement, { mode: 0o700 });
    const released = releaseFederalRunLock(lock, tombstone, { beforeRename: () => { renameSync(lockPath, moved); renameSync(replacement, lockPath); } });
    assert.equal(released, false); assert.equal(lstatSync(lockPath).isDirectory(), true); assert.equal(lstatSync(moved).ino, lock.ino);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stable upload remains bound to its opened descriptor across pathname replacement", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-fd-")); const source = join(dir, "source"); const stable = join(dir, "stable"); const replacement = join(dir, "replacement"); const moved = join(dir, "moved");
  let fd;
  try {
    writeFileSync(source, "approved bytes"); writeFileSync(replacement, "replacement bytes");
    const copied = copyStableDescriptor({ source, destination: stable, expectedBytes: 14, expectedSha256: hash("approved bytes") });
    fd = openSync(stable, "r");
    assert.deepEqual(verifyStableUploadDescriptor({ fd, path: stable, expectedDevice: copied.stableDevice, expectedInode: copied.stableInode, expectedBytes: 14 }), { fdPath: `/dev/fd/${fd}`, stableDevice: copied.stableDevice, stableInode: copied.stableInode, byteLength: 14 });
    renameSync(stable, moved); renameSync(replacement, stable);
    assert.equal(readFileSync(fd, "utf8"), "approved bytes");
    assert.equal(readFileSync(stable, "utf8"), "replacement bytes");
  } finally { if (fd !== undefined) closeSync(fd); rmSync(dir, { recursive: true, force: true }); }
});

test("stable-file and publication failures retain replacements without unlinking them", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-no-unlink-")); const source = join(dir, "source"); const stable = join(dir, "stable"); const replacement = join(dir, "replacement"); const moved = join(dir, "moved");
  try {
    writeFileSync(source, "approved bytes"); writeFileSync(replacement, "replacement bytes");
    assert.throws(() => copyStableDescriptor({ source, destination: stable, expectedBytes: 14, expectedSha256: hash("approved bytes"), hooks: { afterFileFsync: () => { renameSync(stable, moved); renameSync(replacement, stable); throw new Error("swap"); } } }), /diagnostic output was retained/);
    assert.equal(readFileSync(stable, "utf8"), "replacement bytes");
    const publication = join(dir, "publication"); const publicReplacement = join(dir, "public-replacement"); const publicMoved = join(dir, "public-moved"); writeFileSync(publicReplacement, "keep me");
    assert.throws(() => publishFederalMode600(publication, { safe: true }, { afterFileFsync: () => { renameSync(publication, publicMoved); renameSync(publicReplacement, publication); } }), /diagnostic was retained/);
    assert.equal(readFileSync(publication, "utf8"), "keep me");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("canonical blocked readiness cannot be replaced by a self-asserted ready summary", () => {
  const inputs = loadFederalExecutionGateInputs();
  assert.doesNotThrow(() => validateFederalExecutionGates({ ...inputs, requireLive: false, requireReady: false }));
  const ready = structuredClone(inputs.readiness); ready.status = "ready";
  assert.throws(() => validateFederalExecutionGates({ ...inputs, readiness: ready, requireLive: false, requireReady: true }), /claims|status|canonical readiness|independent evidence/i);
});

test("live IAM requires the exact raw file inventory and recomputed digest chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-live-iam-"));
  try {
    const manifest = writeLiveEvidence(dir);
    const validated = validateFederalLiveIamEvidence(manifest, desired, plan);
    assert.match(validated.rawBundleSha256, /^[a-f0-9]{64}$/);
    writeFileSync(join(dir, "extra.json"), "{}\n", { mode: 0o600 });
    assert.throws(() => validateFederalLiveIamEvidence(manifest, desired, plan), /directory inventory drifted/);
    unlinkSync(join(dir, "extra.json"));
    writeFileSync(join(dir, "simulate-role.json"), "{}\n", { mode: 0o600 });
    assert.throws(() => validateFederalLiveIamEvidence(manifest, desired, plan), /byte length drifted|SHA-256 drifted/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stable destination rejects a symlink alias", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-symlink-")); const source = join(dir, "source"); const target = join(dir, "target"); const stable = join(dir, "stable");
  try { writeFileSync(source, "approved bytes"); writeFileSync(target, "target"); symlinkSync(target, stable); assert.throws(() => copyStableDescriptor({ source, destination: stable, expectedBytes: 14, expectedSha256: hash("approved bytes") })); unlinkSync(stable); } finally { rmSync(dir, { recursive: true, force: true }); }
});
