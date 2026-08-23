import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";

const ACCOUNT = "286853118812";
const ROLE = "WitnessTreeCurrentWildfirePromotionUploader";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/${ROLE}`;
const OPERATOR = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const SHA256 = /^[a-f0-9]{64}$/;
const REASON = "The historical approval omitted version-specific read permission. This separate delta must be explicitly approved and live-verified before any storage mutation.";
const OWNER_STATEMENT = "I approve s3:GetObjectVersion on the eight exact current-wildfire keys.";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} fields drifted`);

export function validatePendingWildfireIamApproval(value) {
  exactKeys(value, ["schemaVersion", "status", "roleName", "action", "resources", "reason", "approvedAt", "ownerStatement", "liveIamAttestationSha256", "claims"], "IAM delta approval");
  assert.equal(value.schemaVersion, "witness-tree/current-wildfire-get-object-version-owner-approval/1"); assert.equal(value.roleName, ROLE); assert.equal(value.action, "s3:GetObjectVersion"); assert.equal(value.resources, "data/current-wildfire-immutable-promotion-preparation.json#/proposedRoleScope/objectKeys"); assert.equal(value.reason, REASON);
  assert.equal(value.status, "pending-owner-approval"); assert.equal(value.approvedAt, null); assert.equal(value.ownerStatement, null); assert.equal(value.liveIamAttestationSha256, null); assert.deepEqual(value.claims, { ownerApproved: false, liveIamVerified: false, iamMutationPerformed: false, s3MutationPerformed: false }); return value;
}

export function validateApprovedWildfireIamGate(approvalBytes, liveBytes, plan) {
  const approval = JSON.parse(approvalBytes); const live = JSON.parse(liveBytes);
  exactKeys(approval, ["schemaVersion", "status", "roleName", "action", "resources", "reason", "approvedAt", "ownerStatement", "liveIamAttestationSha256", "claims"], "IAM delta approval");
  assert.equal(approval.schemaVersion, "witness-tree/current-wildfire-get-object-version-owner-approval/1"); assert.equal(approval.status, "owner-approved-live-iam-bound"); assert.equal(approval.roleName, ROLE); assert.equal(approval.action, "s3:GetObjectVersion"); assert.equal(approval.resources, "data/current-wildfire-immutable-promotion-preparation.json#/proposedRoleScope/objectKeys"); assert.equal(approval.reason, REASON); assert.match(approval.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); assert.equal(approval.ownerStatement, OWNER_STATEMENT); assert.match(approval.liveIamAttestationSha256, SHA256); assert.equal(approval.liveIamAttestationSha256, hash(liveBytes)); assert.deepEqual(approval.claims, { ownerApproved: true, liveIamVerified: true, iamMutationPerformed: false, s3MutationPerformed: false });
  exactKeys(live, ["schemaVersion", "status", "capturedAt", "account", "operatorArn", "roleName", "roleArn", "trust", "actions", "resources", "accessAnalyzerFindings", "simulations", "mutation"], "live IAM attestation");
  assert.equal(live.schemaVersion, "witness-tree/current-wildfire-promotion-iam-live-attestation/1"); assert.equal(live.status, "exact-live-readback-passed"); assert.match(live.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); assert.equal(live.account, ACCOUNT); assert.equal(live.operatorArn, OPERATOR); assert.equal(live.roleName, ROLE); assert.equal(live.roleArn, ROLE_ARN); assert.deepEqual(live.trust, { principal: OPERATOR, mfaRequired: true }); assert.deepEqual(live.actions, plan.proposedRoleScope.allow); assert.deepEqual(live.resources, plan.proposedRoleScope.objectKeys); assert.equal(live.accessAnalyzerFindings, 0); assert.deepEqual(live.simulations, { exactEightKeysAllActions: "allowed", exactEightKeysGetObjectVersion: "allowed", otherKeyPutObject: "implicitDeny", otherKeyGetObjectVersion: "implicitDeny", deleteObject: "implicitDeny", iamMutation: "implicitDeny" }); assert.deepEqual(live.mutation, { iamMutationPerformed: false, s3MutationPerformed: false });
  return { approvalSha256: hash(approvalBytes), liveIamSha256: hash(liveBytes) };
}

function ownerBytes(path) { const before = lstatSync(path); assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.uid, process.getuid()); assert.equal(before.mode & 0o777, 0o600); assert.equal(before.nlink, 1); const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const opened = fstatSync(fd); assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino); const bytes = readFileSync(fd); const after = fstatSync(fd); assert.equal(after.dev, opened.dev); assert.equal(after.ino, opened.ino); assert.equal(after.size, opened.size); return bytes; } finally { closeSync(fd); } }

if (process.argv[1]?.endsWith("check-current-wildfire-promotion-iam.mjs")) {
  try {
    const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url)));
    if (process.argv.includes("--require-live")) { const a = process.argv[process.argv.indexOf("--approval") + 1]; const l = process.argv[process.argv.indexOf("--live") + 1]; console.log(JSON.stringify(validateApprovedWildfireIamGate(ownerBytes(a), ownerBytes(l), plan))); }
    else { validatePendingWildfireIamApproval(JSON.parse(readFileSync(new URL("../data/current-wildfire-get-object-version-owner-approval.json", import.meta.url)))); console.log("Current-wildfire GetObjectVersion delta remains pending owner approval and live IAM proof."); }
  } catch { console.error("Current-wildfire IAM gate failed closed; no storage mutation is authorized."); process.exitCode = 65; }
}
