import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const sha = /^[a-f0-9]{64}$/;
export const manifestKey = (a) => a.payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json");
export function sidecarFor(a) { return `${JSON.stringify({schemaVersion:"witness-tree/wildfire-derived-archive-sidecar/1",purpose:"Immutable derived geometry evidence only; never an admission, ingestion, release, or production decision.",sourceId:a.sourceId,payload:{key:a.payloadKey,byteLength:a.byteLength,sha256:a.sha256},profile:a.profile,lineage:a.lineage,sidecarRetention:"rebuildable-not-locked"}, null, 2)}\n`; }
export function validate(plan = read("data/wildfire-derived-immutable-promotion-preparation.json")) {
  assert.equal(plan.status, "preparation-only"); assert.equal(plan.artifacts.length, 2); assert.equal(plan.mfaGatedExecution.proposedRole, "WitnessTreeWildfireDerivedPromotionUploader"); assert.match(plan.requiredApproval, /V10755 quarantine/); assert.deepEqual(plan.claims, {remoteObjectExists:false,retentionApplied:false,immutableObjectStorage:false,ownerAdmission:false,transformed:false,ingested:false,productionEligible:false});
  const [bc,on] = plan.artifacts; assert.equal(bc.featureCount,216); assert.equal(bc.lineage.quarantined,"V10755"); assert.equal(bc.lineage.repaired,"G70362"); assert.equal(on.featureCount,188); assert.equal(on.lineage.repairedFeatureCount,9); assert.equal(on.lineage.closedJoin,true);
  const objectKeys = plan.artifacts.flatMap((a) => [a.payloadKey, manifestKey(a)]);
  assert.deepEqual(plan.proposedRoleScope.allow, ["s3:PutObject","s3:GetObject","s3:PutObjectRetention","s3:GetObjectRetention"]);
  assert.deepEqual(plan.proposedRoleScope.objectKeys, objectKeys);
  assert.deepEqual(plan.proposedRoleScope.payloadKeys, plan.artifacts.map(({ payloadKey }) => payloadKey));
  for (const a of plan.artifacts) { assert.ok(a.payloadKey.startsWith("derived/") && !a.payloadKey.includes("*")); assert.ok(Number.isSafeInteger(a.byteLength) && a.byteLength>0 && sha.test(a.sha256)); assert.equal(manifestKey(a).endsWith("/manifest.json"),true); assert.match(sidecarFor(a),/never an admission/i); }
  for (const denied of ["s3:DeleteObject","s3:DeleteObjectVersion","s3:BypassGovernanceRetention","s3:PutObjectLegalHold","s3:ReplicateObject","s3:PutBucket*","s3:DeleteBucket*","iam:*"]) assert.ok(plan.proposedRoleScope.denyByOmission.includes(denied));
  return plan;
}
export function validateIamDesiredState(desired = read("data/wildfire-derived-immutable-promotion-iam-desired-state.json"), plan = validate()) {
  assert.equal(desired.status, "proposed-not-applied");
  assert.equal(desired.roleName, plan.mfaGatedExecution.proposedRole);
  assert.deepEqual(desired.claims, {iamApplied:false,archiveOperationAuthorized:false,remoteObjectExists:false,retentionApplied:false,ownerAdmission:false,productionEligible:false});
  const [trust] = desired.trustPolicy.Statement;
  assert.deepEqual(trust.Principal, {AWS: plan.proposedRoleScope.trust.principal}); assert.deepEqual(trust.Condition, {Bool:{"aws:MultiFactorAuthPresent":"true"}});
  assert.deepEqual(desired.operatorAssumeRolePolicy.Statement, [{Effect:"Allow",Action:"sts:AssumeRole",Resource:plan.proposedRoleScope.assumeRoleIdentityPolicy.resource}]);
  const [objects, retention] = desired.rolePolicy.Statement;
  const prefix = `arn:aws:s3:::${plan.destination.bucket}/`;
  assert.deepEqual(objects.Action, ["s3:PutObject","s3:GetObject"]); assert.deepEqual(objects.Resource, plan.proposedRoleScope.objectKeys.map((key) => `${prefix}${key}`));
  assert.deepEqual(retention.Action, ["s3:PutObjectRetention","s3:GetObjectRetention"]); assert.deepEqual(retention.Resource, plan.proposedRoleScope.objectKeys.map((key) => `${prefix}${key}`));
  for (const excluded of ["s3:DeleteObject","s3:DeleteObjectVersion","s3:BypassGovernanceRetention","s3:PutObjectLegalHold","s3:AbortMultipartUpload","s3:ListBucket*","s3:PutBucket*","s3:DeleteBucket*","s3:Replicate*","iam:*"]) assert.ok(desired.excluded.includes(excluded));
  return desired;
}
export function dryRunLines(plan=validate()) { return plan.artifacts.flatMap(a => [`VERIFY ${a.id} bytes=${a.byteLength} sha256=${a.sha256}`,`UPLOAD-PENDING s3://${plan.destination.bucket}/${a.payloadKey}`,`SIDECAR-PENDING s3://${plan.destination.bucket}/${manifestKey(a)} sha256=${createHash("sha256").update(sidecarFor(a)).digest("hex")}`,`RETAIN-PENDING ${a.id} mode=COMPLIANCE until=${plan.mfaGatedExecution.recommendedRetainUntil}`,`ADMISSION-BLOCK ${a.sourceId}`]); }
export function writeSidecars(plan = validate(), directory) {
  assert.ok(directory, "sidecar directory is required");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return plan.artifacts.map((artifact) => {
    const file = join(directory, `${artifact.id}.manifest.json`);
    const content = sidecarFor(artifact);
    writeFileSync(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { artifactId: artifact.id, file, byteLength: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") };
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const index = process.argv.indexOf("--write-sidecars");
  if (index !== -1) console.log(JSON.stringify(writeSidecars(validate(), process.argv[index + 1])));
  else console.log(dryRunLines().join("\n"));
}
