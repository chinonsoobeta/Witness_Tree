import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const POLICY_REFS = new Map([
  ["bc-wildfire", "data/bc-wildfire-geometry-policy-2026-08-14.json"],
  ["on-fire-disturbance", "data/ontario-in-year-fire-geometry-policy-2026-08-14.json"]
]);

export function validatePhase1GeometryPolicies({ ledger, bc, ontario, admission }) {
  assert.equal(bc.sourceId, "bc-wildfire");
  assert.equal(ontario.sourceId, "on-fire-disturbance");
  assert.equal(bc.immutablePromotionReady, false);
  assert.equal(bc.ownerAdmissionReady, false);
  assert.equal(bc.productionEligible, false);
  assert.equal(ontario.immutableArchive, false);
  assert.equal(ontario.ownerAdmission, false);
  assert.equal(ontario.ingested, false);
  assert.equal(ontario.productionEligible, false);
  assert.equal(admission.ownerDecision.geometryApproved, true);
  // Exact primary archive evidence was integrated on 2026-08-25. Recovery
  // remains deliberately separate and production is still fail-closed below.
  assert.equal(admission.archiveGate.verifiedObjectCount, 6);
  assert.equal(admission.archiveGate.attestedObjectCount, 0);
  assert.equal(admission.archiveGate.primaryReadbacksVerified, true);
  assert.equal(admission.archiveGate.recoveryReplicaVerified, false);
  assert.equal(admission.pipeline.productionEligible, false);
  const bcAdmission = admission.sources.find(({id}) => id === "bc-wildfire");
  assert.equal(bcAdmission.derived.featureCount, 216);
  assert.deepEqual(bcAdmission.derived.excludedAndQuarantined, ["V10755"]);
  const onAdmission = admission.sources.find(({id}) => id === "on-fire-disturbance");
  assert.equal(onAdmission.derived.featureCount, 188);
  assert.deepEqual(onAdmission.derived.excludedAndQuarantined, []);

  for (const [sourceId, reference] of POLICY_REFS) {
    const entry = ledger.entries.find((candidate) => candidate.id === sourceId);
    assert.ok(entry, `Missing canonical ledger row for ${sourceId}.`);
    assert.equal(entry.productionEligible, false);
    assert.equal(entry.proof.immutableArchive, true);
    assert.equal(entry.proof.productionAdmission, false);
    assert.ok(entry.evidenceRefs.includes(reference), `Ledger must cite ${reference}.`);
  }
  return { ledger, bc, ontario, admission };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

export function checkPhase1GeometryPolicies() {
  return validatePhase1GeometryPolicies({
    ledger: readJson("../data/phase1-production-source-ledger.json"),
    bc: readJson("../data/bc-wildfire-geometry-policy-2026-08-14.json"),
    ontario: readJson("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json"),
    admission: readJson("../data/current-wildfire-owner-admission.json")
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkPhase1GeometryPolicies();
  console.log("Phase 1 BC and Ontario geometry scope has primary exact-version archive evidence; recovery and downstream activation remain blocked.");
}
