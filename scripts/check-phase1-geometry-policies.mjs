import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const POLICY_REFS = new Map([
  ["bc-wildfire", "data/bc-wildfire-geometry-policy-2026-08-14.json"],
  ["on-fire-disturbance", "data/ontario-in-year-fire-geometry-policy-2026-08-14.json"]
]);

export function validatePhase1GeometryPolicies({ ledger, bc, ontario }) {
  assert.equal(bc.sourceId, "bc-wildfire");
  assert.equal(ontario.sourceId, "on-fire-disturbance");
  assert.equal(bc.immutablePromotionReady, false);
  assert.equal(bc.ownerAdmissionReady, false);
  assert.equal(bc.productionEligible, false);
  assert.equal(ontario.immutableArchive, false);
  assert.equal(ontario.ownerAdmission, false);
  assert.equal(ontario.ingested, false);
  assert.equal(ontario.productionEligible, false);

  for (const [sourceId, reference] of POLICY_REFS) {
    const entry = ledger.entries.find((candidate) => candidate.id === sourceId);
    assert.ok(entry, `Missing canonical ledger row for ${sourceId}.`);
    assert.equal(entry.productionEligible, false);
    assert.equal(entry.proof.immutableArchive, false);
    assert.equal(entry.proof.productionAdmission, false);
    assert.ok(entry.evidenceRefs.includes(reference), `Ledger must cite ${reference}.`);
  }
  return { ledger, bc, ontario };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

export function checkPhase1GeometryPolicies() {
  return validatePhase1GeometryPolicies({
    ledger: readJson("../data/phase1-production-source-ledger.json"),
    bc: readJson("../data/bc-wildfire-geometry-policy-2026-08-14.json"),
    ontario: readJson("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json")
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkPhase1GeometryPolicies();
  console.log("Phase 1 BC and Ontario geometry policies remain locally derived and non-admitted.");
}
