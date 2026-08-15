import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const sha = /^[a-f0-9]{64}$/;
export const manifestKey = (a) => a.payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json");
export function sidecarFor(a) { return `${JSON.stringify({schemaVersion:"witness-tree/wildfire-derived-archive-sidecar/1",purpose:"Immutable derived geometry evidence only; never an admission, ingestion, release, or production decision.",sourceId:a.sourceId,payload:{key:a.payloadKey,byteLength:a.byteLength,sha256:a.sha256},profile:a.profile,lineage:a.lineage,sidecarRetention:"rebuildable-not-locked"}, null, 2)}\n`; }
export function validate(plan = read("data/wildfire-derived-immutable-promotion-preparation.json")) {
  assert.equal(plan.status, "preparation-only"); assert.equal(plan.artifacts.length, 2); assert.equal(plan.mfaGatedExecution.proposedRole, "WitnessTreeWildfireDerivedPromotionUploader"); assert.match(plan.requiredApproval, /V10755 quarantine/); assert.deepEqual(plan.claims, {remoteObjectExists:false,retentionApplied:false,immutableObjectStorage:false,ownerAdmission:false,transformed:false,ingested:false,productionEligible:false});
  const [bc,on] = plan.artifacts; assert.equal(bc.featureCount,216); assert.equal(bc.lineage.quarantined,"V10755"); assert.equal(bc.lineage.repaired,"G70362"); assert.equal(on.featureCount,188); assert.equal(on.lineage.repairedFeatureCount,9); assert.equal(on.lineage.closedJoin,true);
  for (const a of plan.artifacts) { assert.ok(a.payloadKey.startsWith("derived/") && !a.payloadKey.includes("*")); assert.ok(Number.isSafeInteger(a.byteLength) && a.byteLength>0 && sha.test(a.sha256)); assert.equal(manifestKey(a).endsWith("/manifest.json"),true); assert.match(sidecarFor(a),/never an admission/i); }
  return plan;
}
export function dryRunLines(plan=validate()) { return plan.artifacts.flatMap(a => [`VERIFY ${a.id} bytes=${a.byteLength} sha256=${a.sha256}`,`UPLOAD-PENDING s3://${plan.destination.bucket}/${a.payloadKey}`,`SIDECAR-PENDING s3://${plan.destination.bucket}/${manifestKey(a)} sha256=${createHash("sha256").update(sidecarFor(a)).digest("hex")}`,`RETAIN-PENDING ${a.id} mode=COMPLIANCE until=${plan.mfaGatedExecution.recommendedRetainUntil}`,`ADMISSION-BLOCK ${a.sourceId}`]); }
if (import.meta.url === `file://${process.argv[1]}`) console.log(dryRunLines().join("\n"));
