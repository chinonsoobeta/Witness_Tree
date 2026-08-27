import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { APPLIED_SHA256, digest, expectedAppliedPolicy, validateNbacArchiveIamDelta } from "./provision-nbac-archive-iam.mjs";

const BEFORE_SHA256 = "805807f54c89954de5a3577d0eb1fe089e7051379050394fa2f3c75b6810f23d";
const TRUST = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileSha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function validateLiveReadback(record) {
  assert.equal(record.schemaVersion, "witness-tree/nbac-archive-iam-live-readback/1");
  assert.equal(record.status, "exact-live-readback");
  assert.equal(record.observedAt, "2026-08-27T19:09:35Z");
  assert.equal(record.accountId, "286853118812");
  assert.equal(record.roleName, "WitnessTreeArchivePromotionUploader");
  assert.equal(record.policyName, "ExactApprovedPromotionOnly");
  assert.equal(record.appliedPolicyCanonicalSha256, APPLIED_SHA256);
  assert.deepEqual(record.trust, { principal: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", mfaRequired: true, exact: true });
  assert.deepEqual(record.objectLock, { bucket: "witness-tree-raw-archive-ca-central-1", enabled: true });
  assert.deepEqual(record.claims, { policyReadBack: true, trustReadBack: true, objectLockReadBack: true, archiveObjectWritten: false, immutableArchive: false, productionAdmission: false });
  return record;
}

function aws(args) {
  const result = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `AWS read-only ${args.slice(0, 2).join(" ")} failed: ${(result.stderr ?? "").trim()}`);
  return JSON.parse(result.stdout);
}

export function validateNbacArchiveIamApplied(record, root = ROOT) {
  assert.equal(record.schemaVersion, "witness-tree/nbac-archive-iam-applied/1");
  assert.equal(record.status, "applied-and-read-back");
  assert.equal(record.appliedAt, "2026-08-27");
  assert.equal(record.accountId, "286853118812");
  assert.equal(record.roleName, "WitnessTreeArchivePromotionUploader");
  assert.equal(record.policyName, "ExactApprovedPromotionOnly");
  assert.equal(record.sourceDelta, "data/nbac-archive-iam-delta.json");
  assert.equal(record.sourceDeltaSha256, "4d4ca610c059c93b1a07c0ca4a5d39f861a25d8cfe0e3b6805abd152f56ec7c8");
  const sourceDeltaFile = path.join(root, record.sourceDelta);
  assert.equal(fileSha256(sourceDeltaFile), record.sourceDeltaSha256);
  validateNbacArchiveIamDelta(JSON.parse(readFileSync(sourceDeltaFile, "utf8")));
  assert.equal(record.liveReadback, "data/nbac-archive-iam-live-readback-2026-08-27.json");
  const liveReadbackFile = path.join(root, record.liveReadback);
  assert.equal(fileSha256(liveReadbackFile), record.liveReadbackSha256);
  validateLiveReadback(JSON.parse(readFileSync(liveReadbackFile, "utf8")));
  assert.equal(record.beforePolicyCanonicalSha256, BEFORE_SHA256);
  assert.equal(record.desiredPolicyCanonicalSha256, APPLIED_SHA256);
  assert.equal(record.appliedPolicyCanonicalSha256, record.desiredPolicyCanonicalSha256);
  assert.deepEqual(record.scope, { exactObjectCount: 2, deleteAllowed: false, retentionBypassAllowed: false, bucketAdministrationAllowed: false, otherObjectAllowed: false });
  assert.deepEqual(record.claims, { iamApplied: true, archiveObjectWritten: false, retentionApplied: false, immutableArchive: false, productionAdmission: false });
  return record;
}

export function verifyLiveNbacArchiveIam(invoke = aws) {
  const expected = expectedAppliedPolicy();
  assert.equal(digest(expected), APPLIED_SHA256);
  const live = invoke(["iam", "get-role-policy", "--role-name", "WitnessTreeArchivePromotionUploader", "--policy-name", "ExactApprovedPromotionOnly"]).PolicyDocument;
  assert.deepEqual(live, expected, "Live inline policy differs from the exact approved policy; no MFA or storage call allowed.");
  assert.equal(digest(live), APPLIED_SHA256);
  const trust = invoke(["iam", "get-role", "--role-name", "WitnessTreeArchivePromotionUploader"]).Role.AssumeRolePolicyDocument;
  assert.deepEqual(trust, TRUST, "Live role trust or MFA condition differs; no MFA or storage call allowed.");
  const lock = invoke(["s3api", "get-object-lock-configuration", "--bucket", "witness-tree-raw-archive-ca-central-1"]);
  assert.equal(lock.ObjectLockConfiguration?.ObjectLockEnabled, "Enabled", "Archive bucket Object Lock is not enabled.");
  return { policySha256: digest(live), trustVerified: true, objectLockEnabled: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.every((arg) => arg === "--verify-live"), "Usage: node scripts/check-nbac-archive-iam-applied.mjs [--verify-live]");
  validateNbacArchiveIamApplied(JSON.parse(readFileSync(new URL("../data/nbac-archive-iam-applied-2026-08-27.json", import.meta.url), "utf8")));
  if (args.includes("--verify-live")) verifyLiveNbacArchiveIam();
  console.log(`NBAC exact-key IAM application evidence passed${args.includes("--verify-live") ? " with live policy, trust and Object Lock readback" : ""}; no archive object is claimed.`);
}
