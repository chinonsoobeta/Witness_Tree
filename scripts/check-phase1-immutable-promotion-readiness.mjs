import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exactPromotionObjects, validateQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const CLAIMS = { remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, transformed: false, ingested: false, productionAdmission: false, productionEligible: false };

export function validatePhase1ImmutablePromotionReadiness(audit, ledger, national, wildfire, wildfireAdmission, quebec, fourthEvidence, fourthPlan, fourthIam) {
  assert.equal(audit.schemaVersion, 1); assert.equal(audit.status, "preparation-audit-only");
  assert.match(audit.notice, /does not call AWS.*alter IAM.*production eligible/i);
  assert.deepEqual(audit.destination, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA", retentionMode: "COMPLIANCE", recommendedRetainUntil: "2033-08-12T00:00:00Z" });
  assert.deepEqual(audit.claims, CLAIMS);
  const localRows = ledger.entries.filter((entry) => entry.evidenceState === "local-verified-profiled").map(({ id }) => id).sort();
  assert.deepEqual([...audit.coveredProductionRowIds].sort(), localRows);
  assert.equal(audit.physicalArtifactGroups.length, 4);
  const rows = audit.physicalArtifactGroups.flatMap((group) => group.productionRowIds);
  assert.equal(new Set(rows).size, rows.length); assert.deepEqual([...rows].sort(), localRows);
  const [nationalGroup, wildfireGroup, quebecGroup, fourthGroup] = audit.physicalArtifactGroups;
  assert.equal(nationalGroup.status, "already-prepared-no-duplicate"); assert.equal(nationalGroup.physicalArtifactCount, national.artifacts.length); assert.deepEqual([...nationalGroup.productionRowIds].sort(), [...national.plannedProductionRowIds].sort());
  assert.equal(wildfireGroup.status, "partially-prepared-derived-promotion-not-prepared");
  assert.equal(wildfireGroup.physicalArtifactCount, wildfireAdmission.archiveGate.requiredObjectCount);
  assert.equal(wildfireGroup.preparedRawArtifactCount, wildfire.artifacts.length);
  assert.equal(wildfireGroup.unpreparedDerivedArtifactCount, wildfireAdmission.archiveGate.requiredObjectCount - wildfire.artifacts.length);
  assert.equal(wildfireGroup.ownerAdmission, "data/current-wildfire-owner-admission.json");
  assert.equal(wildfireAdmission.archiveGate.verifiedObjectCount, 0);
  assert.match(wildfireGroup.blocker, /four exact raw snapshots only.*BC and Ontario derived.*None of the six objects/i);
  assert.equal(wildfireGroup.proposedRole, wildfire.mfaGatedExecution.proposedRole); assert.deepEqual([...wildfireGroup.productionRowIds].sort(), wildfire.artifacts.map((artifact) => read("data/staged-acquisitions.json").entries.find((entry) => entry.id === artifact.id).sourceId).sort());
  assert.equal(quebecGroup.status, "already-prepared"); assert.equal(quebecGroup.physicalArtifactCount, quebec.artifacts.length); assert.equal(quebecGroup.proposedRole, quebec.mfaGatedExecution.proposedRole); assert.deepEqual([...quebecGroup.productionRowIds].sort(), quebec.artifacts.map(({ productionSourceId }) => productionSourceId).sort());
  assert.equal(fourthGroup.status, "already-prepared-blocked-pending-separate-approvals"); assert.equal(fourthGroup.preparation, "data/qc-fourth-inventory-immutable-promotion-preparation.json"); assert.equal(fourthGroup.runner, "node scripts/qc-fourth-inventory-immutable-promotion.mjs"); assert.match(fourthGroup.blocker, /exact 62-key plan.*no AWS or IAM call.*no remote object or read-back/i);
  assert.equal(fourthGroup.physicalArtifactCount, exactPromotionObjects(validateQcFourthInventoryPromotionPreparation(fourthPlan, fourthIam)).length);
  assert.equal(fourthEvidence.fullProductAcquisition.archiveCount, fourthPlan.archiveSet.count);
  for (const field of ["remoteObjectsExist", "retentionApplied", "immutableObjectStorage", "transformed", "ingested", "productionEligible"]) assert.equal(fourthPlan.claims[field], false);
  return audit;
}

export function checkPhase1ImmutablePromotionReadiness() {
  return validatePhase1ImmutablePromotionReadiness(read("data/phase1-immutable-promotion-readiness.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-local-profiled-promotion-preparation.json"), read("data/current-wildfire-immutable-promotion-preparation.json"), read("data/current-wildfire-owner-admission.json"), read("data/qc-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-evidence.json"), read("data/qc-fourth-inventory-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-immutable-promotion-iam-policy.json"));
}

if (process.argv[1]?.endsWith("check-phase1-immutable-promotion-readiness.mjs")) {
  const audit = checkPhase1ImmutablePromotionReadiness();
  console.log(`Phase 1 immutable-promotion readiness audit passed: ${audit.coveredProductionRowIds.length} local-profiled rows, ${audit.physicalArtifactGroups.reduce((sum, group) => sum + group.physicalArtifactCount, 0)} required objects; wildfire derived promotion and QC fourth execution remain blocked.`);
}
