import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const FEDERAL_LIVE_IAM_RAW_NAMES = Object.freeze([
  "caller-identity.json",
  "get-role.json",
  "get-role-policy.json",
  "get-user-policy.json",
  "validate-role-policy.json",
  "validate-operator-policy.json",
  "simulate-operator.json",
  "simulate-role.json"
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} fields drifted`);

function stableBytes(path, label) {
  const before = lstatSync(path);
  assert.equal(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.uid === process.getuid(), true, `${label} is not an owner-only regular file`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    assert.equal(opened.dev === before.dev && opened.ino === before.ino, true, `${label} changed before read`);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    assert.equal(after.dev === opened.dev && after.ino === opened.ino && after.size === opened.size && String(after.mtimeNs) === String(opened.mtimeNs), true, `${label} changed during read`);
    return bytes;
  } finally { closeSync(fd); }
}

function policy(value) {
  if (typeof value === "string") return JSON.parse(decodeURIComponent(value));
  return value;
}

function result(action, resource, decision) {
  return { EvalActionName: action, EvalResourceName: resource, EvalDecision: decision };
}

export function validateFederalLiveIamEvidence(manifestPath, desired, plan) {
  const manifestFile = resolve(manifestPath);
  const directory = dirname(manifestFile);
  assert.equal(basename(manifestFile), "manifest.json", "live IAM evidence manifest basename drifted");
  assert.deepEqual(readdirSync(directory).sort(), [...FEDERAL_LIVE_IAM_RAW_NAMES, "manifest.json"].sort(), "live IAM evidence directory inventory drifted");
  const manifest = JSON.parse(stableBytes(manifestFile, "live IAM evidence manifest"));
  exactKeys(manifest, ["schemaVersion", "status", "capturedAt", "rawFiles", "rawBundleSha256", "claims"], "live IAM evidence manifest");
  assert.equal(manifest.schemaVersion, "witness-tree/federal-electoral-live-iam-file-evidence/1");
  assert.equal(manifest.status, "owner-approved-live-file-evidence-complete");
  assert.match(manifest.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  assert.deepEqual(manifest.claims, { livePoliciesExactlyMatchDesired: true, accessAnalyzerPassed: true, simulationsPassed: true, iamMutationPerformed: false, s3MutationPerformed: false, recoveryAuthorized: false });
  assert.deepEqual(manifest.rawFiles.map(({ name }) => name), [...FEDERAL_LIVE_IAM_RAW_NAMES]);
  const raw = {};
  const records = manifest.rawFiles.map((entry) => {
    exactKeys(entry, ["name", "byteLength", "sha256"], `live IAM raw file ${entry.name}`);
    assert.match(entry.name, /^[a-z0-9-]+\.json$/);
    const bytes = stableBytes(join(directory, entry.name), `live IAM raw file ${entry.name}`);
    assert.equal(bytes.length, entry.byteLength, `${entry.name} byte length drifted`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.name} SHA-256 drifted`);
    raw[entry.name] = JSON.parse(bytes);
    return entry;
  });
  assert.equal(sha256(`${JSON.stringify(records)}\n`), manifest.rawBundleSha256, "live IAM raw bundle digest drifted");

  const account = desired.account;
  const operatorArn = `arn:aws:iam::${account}:user/${desired.operatorUser}`;
  const roleArn = `arn:aws:iam::${account}:role/${desired.roleName}`;
  assert.deepEqual(raw["caller-identity.json"], { Account: account, Arn: operatorArn });
  assert.equal(raw["get-role.json"].Role.Arn, roleArn);
  assert.deepEqual(policy(raw["get-role.json"].Role.AssumeRolePolicyDocument), desired.trustPolicy);
  assert.equal(raw["get-role-policy.json"].RoleName, desired.roleName);
  assert.deepEqual(policy(raw["get-role-policy.json"].PolicyDocument), desired.rolePolicy);
  assert.equal(raw["get-user-policy.json"].UserName, desired.operatorUser);
  assert.deepEqual(policy(raw["get-user-policy.json"].PolicyDocument), desired.operatorPolicy);
  assert.deepEqual(raw["validate-role-policy.json"].findings, []);
  assert.deepEqual(raw["validate-operator-policy.json"].findings, []);
  assert.deepEqual(raw["simulate-operator.json"].EvaluationResults, [
    result("sts:AssumeRole", roleArn, "allowed"),
    result("sts:AssumeRole", `arn:aws:iam::${account}:role/OtherRole`, "implicitDeny")
  ]);
  const payload = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.payloadKey}`;
  const sidecar = `arn:aws:s3:::${desired.bucket}/${plan.deterministicRemoteNames.manifestKey}`;
  const bucket = `arn:aws:s3:::${desired.bucket}`;
  assert.deepEqual(raw["simulate-role.json"].EvaluationResults, [
    result("s3:PutObject", payload, "allowed"), result("s3:GetObject", payload, "allowed"), result("s3:GetObjectVersion", payload, "allowed"),
    result("s3:PutObject", sidecar, "allowed"), result("s3:GetObject", sidecar, "allowed"), result("s3:GetObjectVersion", sidecar, "allowed"),
    result("s3:PutObjectRetention", payload, "allowed"), result("s3:GetObjectRetention", payload, "allowed"), result("s3:ListBucketVersions", bucket, "allowed"),
    result("s3:DeleteObject", payload, "implicitDeny"), result("iam:GetRole", roleArn, "implicitDeny"), result("s3:PutObject", `arn:aws:s3:::${desired.bucket}/other`, "implicitDeny")
  ]);
  return { manifest, manifestSha256: sha256(stableBytes(manifestFile, "live IAM evidence manifest")), rawBundleSha256: manifest.rawBundleSha256 };
}
