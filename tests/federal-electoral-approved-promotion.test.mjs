import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyFederalHeadAbsence } from "../scripts/classify-federal-head-absence.mjs";
import { validateFederalLiveIamEvidence, FEDERAL_LIVE_IAM_RAW_NAMES } from "../scripts/check-federal-electoral-live-iam-evidence.mjs";
import { loadFederalExecutionGateInputs, validateFederalExecutionGates } from "../scripts/check-federal-electoral-promotion-gates.mjs";
import { publishFederalMode600 } from "../scripts/federal-electoral-safe-publication.mjs";
import { acquireFederalRunLock, releaseFederalRunLock } from "../scripts/federal-electoral-run-lock.mjs";
import { copyStableDescriptor, verifyStableSourceDescriptor, verifyStableUploadDescriptor } from "../scripts/federal-electoral-stable-file.mjs";
import { approvedDataRootRealPath, INTERNAL_DATA_ROOT } from "../scripts/data-root.mjs";

const runner = new URL("../scripts/run-federal-electoral-approved-promotion.sh", import.meta.url).pathname;
const plan = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url)));
const desired = JSON.parse(readFileSync(new URL("../data/federal-electoral-promotion-iam-desired-state.json", import.meta.url)));
// The runner refuses a symlinked data root on purpose: it hashes the approved artifact through one
// O_NOFOLLOW descriptor, and a swappable root would defeat that. After the SSD cutover the internal
// path is a compatibility symlink, so the test resolves the approved real root and hands the runner
// a real directory rather than relaxing the guard. Before cutover this returns the internal root
// unchanged, so the test reads the same either way.
const dataRoot = await approvedDataRootRealPath(INTERNAL_DATA_ROOT);
const runnerLock = "/private/tmp/witness-tree-federal-electoral-promotion.run-lock";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const result = (action, resource, decision) => ({ EvalActionName: action, EvalResourceName: resource, EvalDecision: decision, MatchedStatements: [], MissingContextValues: [] });

function cleanupRunnerLock() {
  if (!existsSync(runnerLock)) return;
  const lock = lstatSync(runnerLock);
  assert.equal(lock.isFile() && !lock.isSymbolicLink() && lock.nlink === 1 && lock.uid === process.getuid() && (lock.mode & 0o777) === 0o600, true);
  assert.equal(JSON.parse(readFileSync(runnerLock)).status, "released-owner-cleanup-required");
  unlinkSync(runnerLock);
}

function writeLiveEvidence(dir, mutate = () => {}) {
  const account = desired.account;
  const roleArn = `arn:aws:iam::${account}:role/${desired.roleName}`;
  const operatorArn = `arn:aws:iam::${account}:user/${desired.operatorUser}`;
  const payload = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.payloadKey}`;
  const sidecar = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.manifestKey}`;
  const bucket = `arn:aws:s3:::${desired.bucket}`;
  const values = {
    "caller-identity.json": { UserId: "AIDAEXAMPLE", Account: account, Arn: operatorArn, ResponseMetadata: { RequestId: "opaque-fixture" } },
    "get-role.json": { Role: { Path: "/", RoleName: desired.roleName, RoleId: "AROAEXAMPLE", Arn: roleArn, CreateDate: "2026-08-23T00:00:00.000Z", AssumeRolePolicyDocument: desired.trustPolicy }, ResponseMetadata: {} },
    "get-role-policy.json": { RoleName: desired.roleName, PolicyName: desired.rolePolicyName, PolicyDocument: desired.rolePolicy, ResponseMetadata: {} },
    "list-role-policies.json": { PolicyNames: [desired.rolePolicyName], IsTruncated: false, ResponseMetadata: {} },
    "list-attached-role-policies.json": { AttachedPolicies: [], IsTruncated: false, ResponseMetadata: {} },
    "get-user-policy.json": { UserName: desired.operatorUser, PolicyName: desired.operatorPolicyName, PolicyDocument: desired.operatorPolicy, ResponseMetadata: {} },
    "list-user-policies.json": { PolicyNames: [desired.operatorPolicyName], IsTruncated: false, ResponseMetadata: {} },
    "list-attached-user-policies.json": { AttachedPolicies: [], IsTruncated: false, ResponseMetadata: {} },
    "validate-role-policy.json": { findings: [], ResponseMetadata: {} },
    "validate-operator-policy.json": { findings: [], ResponseMetadata: {} },
    "simulate-operator.json": { IsTruncated: false, EvaluationResults: [result("sts:AssumeRole", roleArn, "allowed"), result("sts:AssumeRole", `arn:aws:iam::${account}:role/OtherRole`, "implicitDeny")], ResponseMetadata: {} },
    "simulate-role.json": { IsTruncated: false, EvaluationResults: [
      result("s3:PutObject", payload, "allowed"), result("s3:GetObject", payload, "allowed"), result("s3:GetObjectVersion", payload, "allowed"),
      result("s3:PutObject", sidecar, "allowed"), result("s3:GetObject", sidecar, "allowed"), result("s3:GetObjectVersion", sidecar, "allowed"),
      result("s3:PutObjectRetention", payload, "allowed"), result("s3:GetObjectRetention", payload, "allowed"), result("s3:ListBucketVersions", bucket, "allowed"),
      ...desired.excluded.map((action) => result(action, action === "s3:ListBucket" ? bucket : action === "iam:GetRole" ? roleArn : payload, "implicitDeny")),
      result("s3:PutObject", `arn:aws:s3:::${desired.bucket}/other`, "implicitDeny"), result("s3:GetObject", `arn:aws:s3:::${desired.bucket}/other`, "implicitDeny"), result("s3:GetObjectVersion", `arn:aws:s3:::${desired.bucket}/other`, "implicitDeny")
    ], ResponseMetadata: {} }
  };
  mutate(values);
  const records = FEDERAL_LIVE_IAM_RAW_NAMES.map((name) => {
    const bytes = Buffer.from(`${JSON.stringify(values[name])}\n`);
    writeFileSync(join(dir, name), bytes, { mode: 0o600 });
    return { name, byteLength: bytes.length, sha256: hash(bytes) };
  });
  const manifest = { schemaVersion: "witness-tree/federal-electoral-live-iam-file-evidence/1", status: "owner-approved-live-file-evidence-complete", capturedAt: "2026-08-23T12:00:00.000Z", rawFiles: records, rawBundleSha256: hash(`${JSON.stringify(records)}\n`), derivedSummary: { policyInventory: { roleInline: [desired.rolePolicyName], roleAttached: [], operatorInline: [desired.operatorPolicyName], operatorAttached: [] }, simulations: { operatorAllowed: 1, operatorDenied: 1, roleAllowed: 9, roleDenied: desired.excluded.length + 3 } }, claims: { rawResponsesUnmodified: true, livePoliciesExactlyMatchDesired: true, accessAnalyzerPassed: true, simulationsPassed: true, iamMutationPerformed: false, s3MutationPerformed: false, recoveryAuthorized: false } };
  const path = join(dir, "manifest.json");
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return path;
}

test("federal preflight is local-only and --run remains blocked", () => {
  try {
    cleanupRunnerLock();
    const preflight = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, FEDERAL_DATA_ROOT: dataRoot } });
    assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
    assert.match(preflight.stdout, /one O_NOFOLLOW descriptor/);
    cleanupRunnerLock();
    const run = spawnSync("zsh", [runner, "--run"], { encoding: "utf8", env: { ...process.env, FEDERAL_DATA_ROOT: dataRoot } });
    assert.equal(run.status, 75);
    assert.match(`${run.stdout}${run.stderr}`, /readiness evidence is not approved|execution remains disabled/i);
    assert.doesNotMatch(readFileSync(runner, "utf8"), /\baws\b|Current MFA TOTP|put-object|\bstat\b|shasum/);
  } finally { cleanupRunnerLock(); }
});

test("federal absence classifier rejects ambiguous provider-shaped text", () => {
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found"), "absent");
  assert.equal(classifyFederalHeadAbsence("An error occurred (404) when calling the HeadObject operation: Not Found\nAn error occurred (AccessDenied)"), "ambiguous");
});

test("owner-only run lock is exclusive, durable, and inode-bound on release", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-lock-")); const lockPath = join(dir, "run.lock");
  try {
    const lock = acquireFederalRunLock(lockPath);
    assert.throws(() => acquireFederalRunLock(lockPath), /EEXIST/);
    assert.equal((lstatSync(lockPath).mode & 0o777), 0o600);
    assert.equal(releaseFederalRunLock(lock), true);
    assert.equal(existsSync(lockPath), true);
    assert.equal(JSON.parse(readFileSync(lockPath)).status, "released-owner-cleanup-required");
    assert.equal(releaseFederalRunLock(lock), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run-lock release never writes or deletes a rename-swapped replacement", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-lock-swap-")); const lockPath = join(dir, "run.lock"); const moved = join(dir, "owned"); const replacement = join(dir, "replacement");
  try {
    const lock = acquireFederalRunLock(lockPath); writeFileSync(replacement, "racing replacement\n", { mode: 0o600 });
    const released = releaseFederalRunLock(lock, { beforeReleaseMarker: () => { renameSync(lockPath, moved); renameSync(replacement, lockPath); } });
    assert.equal(released, false); assert.equal(readFileSync(lockPath, "utf8"), "racing replacement\n"); assert.equal(lstatSync(moved).ino, lock.ino);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run-lock release never overwrites an existing marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-lock-marker-")); const lockPath = join(dir, "run.lock"); const moved = join(dir, "owned");
  try {
    const lock = acquireFederalRunLock(lockPath); renameSync(lockPath, moved); writeFileSync(lockPath, "racing replacement\n", { mode: 0o600 });
    assert.equal(releaseFederalRunLock(lock), false);
    assert.equal(readFileSync(lockPath, "utf8"), "racing replacement\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("source preflight fails closed if its pathname is replaced after descriptor read", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-source-swap-")); const source = join(dir, "source"); const moved = join(dir, "moved"); const replacement = join(dir, "replacement");
  try {
    writeFileSync(source, "approved bytes"); writeFileSync(replacement, "replacement bytes");
    let swapped = false;
    assert.throws(() => verifyStableSourceDescriptor({ source, expectedBytes: 14, expectedSha256: hash("approved bytes"), hooks: { afterRead: () => { if (!swapped) { swapped = true; renameSync(source, moved); renameSync(replacement, source); } } } }), /pathname changed/);
    assert.equal(readFileSync(source, "utf8"), "replacement bytes");
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

test("live IAM manifest is descriptor-read exactly once and its retained bytes supply the digest", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-live-iam-single-manifest-read-"));
  try {
    const manifest = writeLiveEvidence(dir); let reads = 0;
    const expected = hash(readFileSync(manifest));
    const validated = validateFederalLiveIamEvidence(manifest, desired, plan, { manifest: { afterRead: () => { reads += 1; } } });
    assert.equal(reads, 1); assert.equal(validated.manifestSha256, expected);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("live IAM rejects raw pathname replacement, unsafe mode, and same-inode ctime drift", () => {
  for (const scenario of ["rename", "mode", "ctime"]) {
    const dir = mkdtempSync(join(tmpdir(), `federal-live-iam-${scenario}-`));
    try {
      const manifest = writeLiveEvidence(dir); const caller = join(dir, "caller-identity.json");
      if (scenario === "mode") {
        chmodSync(caller, 0o644);
        assert.throws(() => validateFederalLiveIamEvidence(manifest, desired, plan), /mode-600/);
      } else if (scenario === "rename") {
        const moved = join(dir, "caller-identity.moved"); const replacement = join(dir, "caller-identity.replacement"); const replacementBytes = readFileSync(caller);
        assert.throws(() => validateFederalLiveIamEvidence(manifest, desired, plan, { raw: { "caller-identity.json": { afterRead: () => { writeFileSync(replacement, replacementBytes, { mode: 0o600 }); renameSync(caller, moved); renameSync(replacement, caller); } } } }), /descriptor changed|pathname changed/);
        assert.equal(existsSync(moved), true); assert.equal(existsSync(caller), true);
      } else {
        assert.throws(() => validateFederalLiveIamEvidence(manifest, desired, plan, { raw: { "caller-identity.json": { afterRead: () => { chmodSync(caller, 0o400); chmodSync(caller, 0o600); } } } }), /descriptor changed/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("live IAM fails closed on extra or truncated role and user policy inventories", () => {
  const mutations = [
    (values) => values["list-role-policies.json"].PolicyNames.push("UnexpectedRolePolicy"),
    (values) => values["list-attached-role-policies.json"].AttachedPolicies.push({ PolicyName: "Unexpected", PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess" }),
    (values) => values["list-user-policies.json"].PolicyNames.push("UnexpectedUserPolicy"),
    (values) => { values["list-attached-user-policies.json"].IsTruncated = true; }
  ];
  for (const mutate of mutations) {
    const dir = mkdtempSync(join(tmpdir(), "federal-live-iam-inventory-"));
    try { assert.throws(() => validateFederalLiveIamEvidence(writeLiveEvidence(dir, mutate), desired, plan), /inventory drifted|attached policy inventory|truncated/); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("stable destination rejects a symlink alias", () => {
  const dir = mkdtempSync(join(tmpdir(), "federal-symlink-")); const source = join(dir, "source"); const target = join(dir, "target"); const stable = join(dir, "stable");
  try { writeFileSync(source, "approved bytes"); writeFileSync(target, "target"); symlinkSync(target, stable); assert.throws(() => copyStableDescriptor({ source, destination: stable, expectedBytes: 14, expectedSha256: hash("approved bytes") })); unlinkSync(stable); } finally { rmSync(dir, { recursive: true, force: true }); }
});
