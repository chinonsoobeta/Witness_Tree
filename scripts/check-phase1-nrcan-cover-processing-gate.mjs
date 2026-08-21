import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateNrcanCanopyCoverProfile } from "./check-nrcan-canopy-cover-profile.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const REQUIRED_IDS = ["ntems-annual-land-cover", "ntems-canopy-cover"];
const BASELINE = {
  productionRows: 31,
  rawEvidenceNumerator: 15.25,
  rawEvidenceDenominator: 31,
  formalEvidenceTrackingPercentage: 39.7580645,
  immutableArchiveCompleteRows: 11,
  productionAdmissionCompleteRows: 0,
  productionEligibleRows: 0,
};

function existingReferences(refs) {
  assert.ok(Array.isArray(refs));
  for (const ref of refs) {
    assert.match(ref, /^data\/[A-Za-z0-9_./-]+\.json$/);
    assert.equal(existsSync(new URL(`../${ref}`, import.meta.url)), true, `missing evidence reference ${ref}`);
  }
}

function validateNoTransformClaim(row) {
  assert.deepEqual(row.namedTransformations, []);
  const transform = row.transformation;
  assert.equal(transform.status, "blocked-no-approved-named-specification");
  assert.equal(transform.specification, null);
  assert.equal(transform.run, null);
  assert.equal(transform.output, null);
  assert.ok(transform.requiredBeforeExecution.length >= 3);
  assert.ok(transform.blockers.length >= 3);
  assert.equal(row.ingestion.status, "blocked-no-transformation-output");
  assert.equal(row.release.status, "blocked");
  assert.equal(row.release.productionAdmission, false);
  assert.equal(row.release.productionEligible, false);
  assert.equal(row.productionAdmission, false);
  assert.equal(row.productionEligible, false);
  assert.deepEqual(row.scoreImpact, { currentRawCreditDelta: 0, maximumRawCreditDelta: 0, formalPercentagePointDelta: 0 });
}

export function validatePhase1NrcanCoverProcessingGate(audit, ledger = read("data/phase1-production-source-ledger.json"), canopyProfile = read("data/nrcan-canopy-cover-profile.json")) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-nrcan-cover-processing-gate/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /no AWS call.*archive mutation.*transformation.*production-eligibility change/i);
  assert.equal(audit.derivedFromHead, "ffe949e9a426b3276339cb3fb4e975455f0d2f13");
  assert.deepEqual(audit.baseline, { ...BASELINE, scoreDelta: { rawCredit: 0, formalPercentagePoints: 0 } });
  assert.deepEqual(audit.claims, {
    rawArchiveMutation: false,
    transformed: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    phase2Started: false,
  });
  assert.deepEqual(audit.rows.map(({ id }) => id), REQUIRED_IDS);
  assert.equal(ledger.entries.length, 31);
  assert.equal(ledger.rawEvidenceNumerator, BASELINE.rawEvidenceNumerator);
  assert.equal(ledger.formalProgress.percentage, BASELINE.formalEvidenceTrackingPercentage);
  assert.equal(ledger.entries.filter(({ proof }) => proof.immutableArchive).length, BASELINE.immutableArchiveCompleteRows);
  assert.equal(ledger.entries.filter(({ proof }) => proof.productionAdmission).length, BASELINE.productionAdmissionCompleteRows);
  assert.equal(ledger.entries.filter(({ productionEligible }) => productionEligible).length, BASELINE.productionEligibleRows);

  const annual = audit.rows[0];
  assert.equal(annual.evidenceState, "remote-verified-archived-profiled");
  assert.equal(annual.rawCredit, 1);
  assert.deepEqual(annual.evidenceRefs, ["data/vlce2-remote-promotion-evidence.json", "data/raster-grid.json", "data/raster-defects.json"]);
  existingReferences(annual.evidenceRefs);
  assert.deepEqual(annual.namedValidationGates.map(({ id, status }) => [id, status]), [
    ["vlce2-remote-archive", "passed"],
    ["vlce2-grid-and-sidecar-defect-gate", "passed"],
  ]);
  validateNoTransformClaim(annual);

  const canopy = audit.rows[1];
  assert.equal(canopy.evidenceState, "remote-verified-archived-profiled");
  assert.equal(canopy.rawCredit, 1);
  assert.deepEqual(canopy.evidenceRefs, ["data/staged-acquisitions.json", "data/nrcan-canopy-cover-profile.json", "data/immutable-promotions.json"]);
  existingReferences(canopy.evidenceRefs);
  assert.deepEqual(canopy.namedValidationGates.map(({ id, status }) => [id, status]), [
    ["canopy-cover-staging-profile", "passed"],
    ["canopy-cover-immutable-archive", "passed"],
  ]);
  validateNoTransformClaim(canopy);
  validateNrcanCanopyCoverProfile(canopyProfile);

  assert.equal(audit.baseline.scoreDelta.rawCredit, 0);
  assert.equal(audit.baseline.scoreDelta.formalPercentagePoints, 0);
  assert.match(audit.nextLawfulAction, /named checksum-bound specification/i);
  const serialized = JSON.stringify(audit);
  assert.doesNotMatch(serialized, /"(?:transformed|ingested|released|productionAdmission|productionEligible)":true/);
  return audit;
}

export function checkPhase1NrcanCoverProcessingGate() {
  return validatePhase1NrcanCoverProcessingGate(read("data/phase1-nrcan-cover-processing-gate.json"));
}

if (process.argv[1]?.endsWith("check-phase1-nrcan-cover-processing-gate.mjs")) {
  const audit = checkPhase1NrcanCoverProcessingGate();
  console.log(`Phase 1 NRCan cover processing gate passed: ${audit.rows.length} rows profiled; transformations and ingestion remain blocked; baseline ${audit.baseline.formalEvidenceTrackingPercentage}%.`);
}
