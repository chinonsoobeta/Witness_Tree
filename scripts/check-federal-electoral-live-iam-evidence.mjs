import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const FEDERAL_LIVE_IAM_RAW_NAMES = Object.freeze([
  "caller-identity.json",
  "get-role.json",
  "get-role-policy.json",
  "list-role-policies.json",
  "list-attached-role-policies.json",
  "get-user-policy.json",
  "list-user-policies.json",
  "list-attached-user-policies.json",
  "validate-role-policy.json",
  "validate-operator-policy.json",
  "simulate-operator.json",
  "simulate-role.json"
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} fields drifted`);

function requireNoFollow() {
  assert.equal(typeof constants.O_NOFOLLOW === "number" && constants.O_NOFOLLOW !== 0, true, "live IAM evidence requires O_NOFOLLOW support");
  return constants.O_NOFOLLOW;
}

function exactIdentity(value) {
  return { dev: String(value.dev), ino: String(value.ino), size: String(value.size), nlink: String(value.nlink), uid: String(value.uid), mode: Number(value.mode & 0o777n), mtimeNs: String(value.mtimeNs), ctimeNs: String(value.ctimeNs) };
}

export function stableBytes(path, label, hooks = {}) {
  const noFollow = requireNoFollow();
  const before = lstatSync(path, { bigint: true });
  assert.equal(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.uid === BigInt(process.getuid()) && (before.mode & 0o777n) === 0o600n, true, `${label} is not an owner-only mode-600 regular file`);
  const fd = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(fd, { bigint: true });
    assert.deepEqual(exactIdentity(opened), exactIdentity(before), `${label} changed before read`);
    const bytes = readFileSync(fd);
    hooks.afterRead?.(path, opened, bytes);
    const after = fstatSync(fd, { bigint: true });
    const namedAfter = lstatSync(path, { bigint: true });
    assert.equal(namedAfter.isFile() && !namedAfter.isSymbolicLink(), true, `${label} pathname is not a regular file after read`);
    assert.deepEqual(exactIdentity(after), exactIdentity(opened), `${label} descriptor changed during read`);
    assert.deepEqual(exactIdentity(namedAfter), exactIdentity(opened), `${label} pathname changed during read`);
    return { bytes, sha256: sha256(bytes), identity: exactIdentity(opened) };
  } finally { closeSync(fd); }
}

function policy(value) {
  if (typeof value === "string") return JSON.parse(decodeURIComponent(value));
  return value;
}

function result(action, resource, decision) {
  return { EvalActionName: action, EvalResourceName: resource, EvalDecision: decision };
}

function required(value, key, label) {
  assert.equal(value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, key), true, `${label} is missing ${key}`);
  return value[key];
}

function simulationResults(value, label) {
  assert.equal(required(value, "IsTruncated", label), false, `${label} is truncated`);
  const results = required(value, "EvaluationResults", label);
  assert.equal(Array.isArray(results), true, `${label} EvaluationResults is invalid`);
  return results.map((entry, index) => result(
    required(entry, "EvalActionName", `${label} result ${index}`),
    required(entry, "EvalResourceName", `${label} result ${index}`),
    required(entry, "EvalDecision", `${label} result ${index}`)
  ));
}

function exactPolicyInventory(value, names, label) {
  assert.deepEqual(required(value, "PolicyNames", label), names, `${label} inline policy inventory drifted`);
  assert.equal(required(value, "IsTruncated", label), false, `${label} policy inventory is truncated`);
}

function noAttachedPolicies(value, label) {
  assert.deepEqual(required(value, "AttachedPolicies", label), [], `${label} attached policy inventory drifted`);
  assert.equal(required(value, "IsTruncated", label), false, `${label} attached policy inventory is truncated`);
}

export function validateFederalLiveIamEvidence(manifestPath, desired, plan, hooks = {}) {
  requireNoFollow();
  const manifestFile = resolve(manifestPath);
  const directory = dirname(manifestFile);
  assert.equal(basename(manifestFile), "manifest.json", "live IAM evidence manifest basename drifted");
  assert.deepEqual(readdirSync(directory).sort(), [...FEDERAL_LIVE_IAM_RAW_NAMES, "manifest.json"].sort(), "live IAM evidence directory inventory drifted");
  const manifestRead = stableBytes(manifestFile, "live IAM evidence manifest", hooks.manifest);
  const manifest = JSON.parse(manifestRead.bytes);
  exactKeys(manifest, ["schemaVersion", "status", "capturedAt", "rawFiles", "rawBundleSha256", "derivedSummary", "claims"], "live IAM evidence manifest");
  assert.equal(manifest.schemaVersion, "witness-tree/federal-electoral-live-iam-file-evidence/1");
  assert.equal(manifest.status, "owner-approved-live-file-evidence-complete");
  assert.match(manifest.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  assert.deepEqual(manifest.claims, { rawResponsesUnmodified: true, livePoliciesExactlyMatchDesired: true, accessAnalyzerPassed: true, simulationsPassed: true, iamMutationPerformed: false, s3MutationPerformed: false, recoveryAuthorized: false });
  assert.deepEqual(manifest.rawFiles.map(({ name }) => name), [...FEDERAL_LIVE_IAM_RAW_NAMES]);
  const raw = {};
  const records = manifest.rawFiles.map((entry) => {
    exactKeys(entry, ["name", "byteLength", "sha256"], `live IAM raw file ${entry.name}`);
    assert.match(entry.name, /^[a-z0-9-]+\.json$/);
    const { bytes } = stableBytes(join(directory, entry.name), `live IAM raw file ${entry.name}`, hooks.raw?.[entry.name]);
    assert.equal(bytes.length, entry.byteLength, `${entry.name} byte length drifted`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.name} SHA-256 drifted`);
    raw[entry.name] = JSON.parse(bytes);
    return entry;
  });
  assert.equal(sha256(`${JSON.stringify(records)}\n`), manifest.rawBundleSha256, "live IAM raw bundle digest drifted");

  const account = desired.account;
  const operatorArn = `arn:aws:iam::${account}:user/${desired.operatorUser}`;
  const roleArn = `arn:aws:iam::${account}:role/${desired.roleName}`;
  assert.equal(required(raw["caller-identity.json"], "Account", "caller identity"), account);
  assert.equal(required(raw["caller-identity.json"], "Arn", "caller identity"), operatorArn);
  assert.match(required(raw["caller-identity.json"], "UserId", "caller identity"), /^\S+$/, "caller identity UserId is invalid");
  const role = required(raw["get-role.json"], "Role", "get role");
  assert.equal(required(role, "Arn", "get role Role"), roleArn);
  assert.deepEqual(policy(required(role, "AssumeRolePolicyDocument", "get role Role")), desired.trustPolicy);
  assert.equal(required(raw["get-role-policy.json"], "RoleName", "get role policy"), desired.roleName);
  assert.equal(required(raw["get-role-policy.json"], "PolicyName", "get role policy"), desired.rolePolicyName);
  assert.deepEqual(policy(required(raw["get-role-policy.json"], "PolicyDocument", "get role policy")), desired.rolePolicy);
  exactPolicyInventory(raw["list-role-policies.json"], [desired.rolePolicyName], "list role policies");
  noAttachedPolicies(raw["list-attached-role-policies.json"], "list attached role policies");
  assert.equal(required(raw["get-user-policy.json"], "UserName", "get user policy"), desired.operatorUser);
  assert.equal(required(raw["get-user-policy.json"], "PolicyName", "get user policy"), desired.operatorPolicyName);
  assert.deepEqual(policy(required(raw["get-user-policy.json"], "PolicyDocument", "get user policy")), desired.operatorPolicy);
  exactPolicyInventory(raw["list-user-policies.json"], [desired.operatorPolicyName], "list user policies");
  noAttachedPolicies(raw["list-attached-user-policies.json"], "list attached user policies");
  assert.deepEqual(required(raw["validate-role-policy.json"], "findings", "validate role policy"), []);
  assert.deepEqual(required(raw["validate-operator-policy.json"], "findings", "validate operator policy"), []);
  assert.deepEqual(simulationResults(raw["simulate-operator.json"], "simulate operator"), [
    result("sts:AssumeRole", roleArn, "allowed"),
    result("sts:AssumeRole", `arn:aws:iam::${account}:role/OtherRole`, "implicitDeny")
  ]);
  const payload = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.payloadKey}`;
  const sidecar = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.manifestKey}`;
  const bucket = `arn:aws:s3:::${desired.bucket}`;
  const other = `arn:aws:s3:::${desired.bucket}/other`;
  const allowed = [
    result("s3:PutObject", payload, "allowed"), result("s3:GetObject", payload, "allowed"), result("s3:GetObjectVersion", payload, "allowed"),
    result("s3:PutObject", sidecar, "allowed"), result("s3:GetObject", sidecar, "allowed"), result("s3:GetObjectVersion", sidecar, "allowed"),
    result("s3:PutObjectRetention", payload, "allowed"), result("s3:GetObjectRetention", payload, "allowed"), result("s3:ListBucketVersions", bucket, "allowed")
  ];
  const deniedResources = new Map([
    ["s3:ListBucket", bucket],
    ["iam:GetRole", roleArn]
  ]);
  const denied = desired.excluded.map((action) => result(action, deniedResources.get(action) ?? payload, "implicitDeny"));
  denied.push(result("s3:PutObject", other, "implicitDeny"), result("s3:GetObject", other, "implicitDeny"), result("s3:GetObjectVersion", other, "implicitDeny"));
  assert.deepEqual(simulationResults(raw["simulate-role.json"], "simulate role"), [...allowed, ...denied]);
  assert.deepEqual(manifest.derivedSummary, {
    policyInventory: { roleInline: [desired.rolePolicyName], roleAttached: [], operatorInline: [desired.operatorPolicyName], operatorAttached: [] },
    simulations: { operatorAllowed: 1, operatorDenied: 1, roleAllowed: allowed.length, roleDenied: denied.length }
  });
  return { manifest, manifestSha256: manifestRead.sha256, rawBundleSha256: manifest.rawBundleSha256 };
}
