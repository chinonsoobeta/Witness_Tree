import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APPROVED = "approved-source-ledger-only";
const EXPECTED_IDS = [
  "ntems-forest-harvest",
  "ntems-annual-land-cover",
  "ntems-canopy-height",
  "ntems-canopy-cover",
  "ab-avi-crown",
  "ab-avi-post-harvest",
  "ab-primary-land-vegetation",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
];

export function validateRemoteAdmissionDecisions(decisions, ledger) {
  assert.equal(decisions.schemaVersion, 1);
  assert.equal(decisions.status, "owner-decisions-recorded");
  assert.match(decisions.notice, /Nine named.*source-ledger decisions.*Quebec.*PLVI.*scope-bound validation/i);
  const remote = ledger.entries.filter((entry) => entry.evidenceState === "remote-verified-archived-profiled");
  assert.deepEqual(decisions.decisions.map(({ id }) => id), EXPECTED_IDS);
  for (const decision of decisions.decisions) {
    const row = remote.find((entry) => entry.id === decision.id);
    assert.ok(row);
    assert.ok(Object.entries(row.proof).filter(([key]) => key !== "productionAdmission").every(([, value]) => value));
    assert.equal(row.proof.productionAdmission, false);
    assert.equal(row.productionEligible, false);
    assert.equal(decision.sourceEvidenceComplete, true);
    assert.equal(decision.profileIssueResolved, true);
    assert.equal(decision.ownerAdmission, APPROVED);
    assert.match(decision.scope, /does not authorize (?:transformation admission|transformation), ingestion, release, runtime production eligibility, or any other source/i);
  }
  for (const id of ["ntems-forest-harvest", "ntems-canopy-height", "qc-current-ecoforest", "qc-original-current-inventory"]) {
    const decision = decisions.decisions.find(({ id: candidate }) => candidate === id);
    assert.equal(decision.scopeDecision, "accepted-named-source-ledger-only");
  }
  for (const id of ["qc-current-ecoforest", "qc-original-current-inventory"]) {
    const decision = decisions.decisions.find(({ id: candidate }) => candidate === id);
    assert.equal(decision.evidenceRef, "data/qc-immutable-promotion-attestation.json");
  }
  const plvi = decisions.decisions.find(({ id }) => id === "ab-primary-land-vegetation");
  assert.equal(plvi.scopeDecision, "approved-raw-and-derived-scope-only");
  assert.match(plvi.scope, /179,087-feature closed-join derived artifact.*12 bounded repairs.*POLYGON_ID 41405.*no feature loss/i);
  assert.match(plvi.scope, /scope-bound validation and ingestion preparation only/i);
  assert.deepEqual(plvi.evidenceRefs, [
    "data/alberta-plvi-immutable-promotion-evidence.json",
    "data/alberta-plvi-full-release-readiness.json",
    "data/phase1-alberta-transform-ingestion-audit.json",
  ]);
  const crown = decisions.decisions.find((decision) => decision.id === "ab-avi-crown");
  assert.equal(crown.evidenceRef, "data/alberta-avi-crown-quarantine-decision.json");
  assert.match(crown.scope, /AVI_PostInventoryHarvestIndex FID 1.*zero AVI_Crown observations.*no Crown denominator impact/i);
  assert.deepEqual(decisions.nonProduction, {
    sourceLedgerDecisionsRecorded: true,
    scopeDecisionRecorded: true,
    rawEvidenceDelta: 0,
    formalEvidenceTrackingPercentagePointDelta: 0,
    transformationAdmission: false,
    ingestionAdmission: false,
    ingested: false,
    releaseApproval: false,
    productionAdmission: false,
    productionEligible: false,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
  });
  return decisions;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url)));
  const decisions = validateRemoteAdmissionDecisions(read("phase1-remote-source-admission-decisions.json"), read("phase1-production-source-ledger.json"));
  console.log(`Remote source-ledger decisions recorded for ${decisions.decisions.length}/31 named rows; all remain non-production.`);
}
