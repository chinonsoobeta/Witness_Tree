import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateIntegratedCurrentWildfireProductionEligibility } from "./check-current-wildfire-owner-admission.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const IDS = ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"];

export function validateCurrentWildfireDownstreamReconciliation(record, owner, raw, derived, ledger) {
  assert.equal(record.schemaVersion, "witness-tree/current-wildfire-downstream-reconciliation/1");
  assert.equal(record.status, "four-rows-production-admitted");
  assert.match(record.notice, /no AWS operation.*deployment.*Phase 2/i);
  assert.deepEqual([record.approvalRef, record.rawEvidenceRef, record.derivedEvidenceRef], [
    "data/current-wildfire-owner-admission.json",
    "data/current-wildfire-raw-archive-evidence.json",
    "data/current-wildfire-derived-archive-evidence.json"
  ]);
  assert.deepEqual(record.gate, {
    requiredPayloads: 6,
    verifiedPayloads: 6,
    conditionSatisfied: true,
    recoveryReplicaRequiredByApproval: false,
    mutationProvenanceRequiredByApproval: false,
    additionalProductionDecisionRequiredByApproval: false
  });
  assert.equal(owner.archiveGate.requiredObjectCount, 6);
  assert.equal(owner.archiveGate.verifiedObjectCount, 6);
  assert.equal(evaluateIntegratedCurrentWildfireProductionEligibility(owner, raw, derived), true);
  assert.deepEqual(record.rows.map(({ id }) => id), IDS);
  for (const row of record.rows) {
    assert.equal(row.transformationValidated, true);
    assert.equal(row.ingestionAdmitted, true);
    assert.equal(row.releaseApproved, true);
    assert.equal(row.productionAdmission, true);
    assert.equal(row.productionEligible, true);
    assert.match(row.releaseBoundary, /\S/);
    const canonical = ledger.entries.find(({ id }) => id === row.id);
    assert.ok(canonical, `Missing ledger row ${row.id}.`);
    assert.equal(canonical.proof.immutableArchive, true);
    assert.equal(canonical.proof.productionAdmission, true);
    assert.equal(canonical.productionEligible, true);
    assert.ok(canonical.evidenceRefs.includes("data/current-wildfire-downstream-reconciliation.json"));
  }
  assert.match(record.rows.find(({ id }) => id === "bc-wildfire").releaseBoundary, /216.*G70362.*V10755.*never claim 217/i);
  assert.match(record.rows.find(({ id }) => id === "on-fire-disturbance").releaseBoundary, /188.*179.*nine bounded repairs.*zero exclusions/i);
  assert.deepEqual(record.impact, {
    rowStateChanges: 4,
    rawEvidenceCreditDelta: 0,
    formalEvidenceTrackingPercentagePointDelta: 0,
    productionAdmissionDelta: 4,
    productionEligibleDelta: 4,
    runtimeDeploymentPerformed: false
  });
  return record;
}

export function checkCurrentWildfireDownstreamReconciliation() {
  return validateCurrentWildfireDownstreamReconciliation(
    read("data/current-wildfire-downstream-reconciliation.json"),
    read("data/current-wildfire-owner-admission.json"),
    read("data/current-wildfire-raw-archive-evidence.json"),
    read("data/current-wildfire-derived-archive-evidence.json"),
    read("data/phase1-production-source-ledger.json")
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkCurrentWildfireDownstreamReconciliation();
  console.log("Current-wildfire downstream reconciliation passed: 4/4 rows production admitted; raw score unchanged.");
}
