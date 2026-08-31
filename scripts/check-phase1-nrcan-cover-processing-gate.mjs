import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";
import { validateNrcanCanopyCoverProfile } from "./check-nrcan-canopy-cover-profile.mjs";
import { validateImmutablePromotions } from "./check-immutable-promotions.mjs";
import { validateRasterDefects, validateRasterGrid } from "./check-raster-grid.mjs";
import { validateVlce2RemotePromotionEvidence } from "./check-vlce2-remote-promotion-evidence.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const REQUIRED_IDS = ["ntems-annual-land-cover", "ntems-canopy-cover"];
const BASELINE = {
  productionRows: 31,
  rawEvidenceNumerator: 14.25,
  rawEvidenceDenominator: 31,
  formalEvidenceTrackingPercentage: 38.7903226,
  immutableArchiveCompleteRows: 7,
  productionAdmissionCompleteRows: 0,
  productionEligibleRows: 0,
};

const FEDERAL_IDS = ["fed-2023-ridings", "elections-canada-45th-files"];
const NBAC_ID = "cwfis-historical";
const HISTORICAL_TRANSITION_IDS = [
  "cwfis-current",
  "bc-wildfire",
  "ab-wildfire",
  "on-fire-disturbance",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
  "qc-fourth-inventory",
  NBAC_ID,
  ...FEDERAL_IDS,
];
const HISTORICAL_ROW_STATE = {
  evidenceState: "local-verified-profiled",
  rawCredit: 0.75,
  immutableArchive: false,
  productionAdmission: false,
  productionEligible: false,
};
const LATER_ARCHIVE_STATE = {
  evidenceState: "remote-verified-archived-profiled",
  rawCredit: 1,
  immutableArchive: true,
  productionAdmission: false,
  productionEligible: false,
};
const LATER_FEDERAL_STATE = {
  evidenceState: "production-admitted",
  rawCredit: 1,
  immutableArchive: true,
  productionAdmission: true,
  productionEligible: true,
};
const HISTORICAL_NBAC_STATE = {
  evidenceState: "partial-component",
  rawCredit: 0.25,
  immutableArchive: false,
  productionAdmission: false,
  productionEligible: false,
};
const LATER_NBAC_STATE = {
  evidenceState: "local-verified-profiled",
  rawCredit: 0.75,
  immutableArchive: false,
  productionAdmission: false,
  productionEligible: false,
};
const HISTORICAL_LEDGER_FIELDS_SHA256 = "3606c9f0e989a2995129fa9b7f565d3272cbf4279eb3af01c6ad944977de4eef";

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
  assert.equal(transform.status, "blocked-no-phase1-production-named-specification-and-output");
  assert.equal(transform.specification, null);
  assert.equal(transform.run, null);
  assert.equal(transform.output, null);
  assert.ok(transform.requiredBeforeExecution.length >= 3);
  assert.ok(transform.blockers.length >= 3);
  assert.match(transform.requiredBeforeExecution[0], /Phase 1 production-admission.*separate Phase 2 nonproduction method is insufficient/i);
  assert.match(transform.blockers[0], /Phase 1 production-admission.*separate Phase 2 nonproduction method/i);
  assert.equal(row.ingestion.status, "blocked-no-transformation-output");
  assert.equal(row.release.status, "blocked");
  assert.equal(row.release.productionAdmission, false);
  assert.equal(row.release.productionEligible, false);
  assert.equal(row.productionAdmission, false);
  assert.equal(row.productionEligible, false);
  assert.deepEqual(row.scoreImpact, { currentRawCreditDelta: 0, maximumRawCreditDelta: 0, formalPercentagePointDelta: 0 });
}

function ledgerFields(entry) {
  return {
    id: entry.id,
    evidenceState: entry.evidenceState,
    rawCredit: entry.rawCredit,
    immutableArchive: entry.proof?.immutableArchive,
    productionAdmission: entry.proof?.productionAdmission,
    productionEligible: entry.productionEligible,
  };
}

function projectHistoricalLedger(ledger) {
  assert.equal(ledger.entries.length, 31);
  const transitionIds = new Set(HISTORICAL_TRANSITION_IDS);
  let admittedFederalRows = 0;
  const entries = ledger.entries.map((entry) => {
    if (!transitionIds.has(entry.id)) return entry;

    const observed = ledgerFields(entry);
    const historicalState = entry.id === NBAC_ID ? HISTORICAL_NBAC_STATE : HISTORICAL_ROW_STATE;
    const laterState = FEDERAL_IDS.includes(entry.id) ? LATER_FEDERAL_STATE : entry.id === NBAC_ID ? LATER_NBAC_STATE : LATER_ARCHIVE_STATE;
    const historical = { id: entry.id, ...historicalState };
    const later = { id: entry.id, ...laterState };
    if (JSON.stringify(observed) === JSON.stringify(historical)) return entry;
    assert.deepEqual(observed, later, `${entry.id} must be either the bound historical state or a verified later state.`);
    if (FEDERAL_IDS.includes(entry.id)) admittedFederalRows += 1;
    return {
      ...entry,
      evidenceState: historicalState.evidenceState,
      rawCredit: historicalState.rawCredit,
      proof: { ...entry.proof, immutableArchive: historicalState.immutableArchive, productionAdmission: historicalState.productionAdmission },
      productionEligible: historicalState.productionEligible,
    };
  });

  if (admittedFederalRows > 0) {
    assert.equal(admittedFederalRows, FEDERAL_IDS.length, "The shared federal admission must cover both ledger rows.");
    validateFederalAdmission(read("data/phase1-federal-electoral-production-admission.json"));
  }
  const fields = entries.map(ledgerFields);
  assert.equal(createHash("sha256").update(JSON.stringify(fields)).digest("hex"), HISTORICAL_LEDGER_FIELDS_SHA256, "The bound historical ledger state drifted.");
  return entries;
}

export function validatePhase1NrcanCoverProcessingGate(audit, ledger = read("data/phase1-production-source-ledger.json"), canopyProfile = read("data/nrcan-canopy-cover-profile.json")) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-nrcan-cover-processing-gate/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /no AWS call.*archive mutation.*transformation.*production-eligibility change/i);
  assert.match(audit.notice, /absence of a Phase 1 production-admission target transformation.*separately approved Phase 2 nonproduction method does not close/i);
  assert.equal(audit.derivedFromHead, "71925af03fc08b052d12077de2ba4acb9239006b");
  assert.deepEqual(audit.baseline, { auditedAt: "2026-08-21T15:45:00Z", ...BASELINE, scoreDelta: { rawCredit: 0, formalPercentagePoints: 0 } });
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
  const historicalEntries = projectHistoricalLedger(ledger);
  assert.equal(audit.baseline.rawEvidenceNumerator, BASELINE.rawEvidenceNumerator);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, BASELINE.formalEvidenceTrackingPercentage);
  assert.equal(audit.baseline.immutableArchiveCompleteRows, BASELINE.immutableArchiveCompleteRows);
  assert.equal(historicalEntries.filter(({ proof }) => proof.immutableArchive).length, BASELINE.immutableArchiveCompleteRows);
  assert.equal(historicalEntries.filter(({ proof }) => proof.productionAdmission).length, BASELINE.productionAdmissionCompleteRows);
  assert.equal(historicalEntries.filter(({ productionEligible }) => productionEligible).length, BASELINE.productionEligibleRows);
  const annualPlan = read("data/vlce2-promotion-preparation.json");
  const annualRemote = read("data/vlce2-remote-promotion-evidence.json");
  const grid = read("data/raster-grid.json");
  validateVlce2RemotePromotionEvidence(annualRemote, annualPlan);
  validateRasterGrid(grid);
  validateRasterDefects(read("data/raster-defects.json"), grid);
  validateImmutablePromotions(read("data/immutable-promotions.json"));

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
  const stagedCanopy = read("data/staged-acquisitions.json").entries.find(({ id }) => id === "nrcan-forest-canopy-cover-2022-2026-08-11");
  assert.ok(stagedCanopy);
  assert.equal(stagedCanopy.sourceId, "nrcan-forest-canopy-cover-2022");
  assert.equal(stagedCanopy.byteLength, canopyProfile.raw.byteLength);
  assert.equal(stagedCanopy.sha256, canopyProfile.raw.sha256);
  assert.equal(stagedCanopy.immutableObjectStorage, false);
  assert.equal(stagedCanopy.productionEligible, false);
  assert.deepEqual(canopy.namedValidationGates.map(({ id, status }) => [id, status]), [
    ["canopy-cover-staging-profile", "passed"],
    ["canopy-cover-immutable-archive", "passed"],
  ]);
  validateNoTransformClaim(canopy);
  validateNrcanCanopyCoverProfile(canopyProfile);

  assert.equal(audit.baseline.scoreDelta.rawCredit, 0);
  assert.equal(audit.baseline.scoreDelta.formalPercentagePoints, 0);
  assert.match(audit.nextLawfulAction, /Phase 1 production-admission.*named checksum-bound specification.*do not substitute.*Phase 2 nonproduction method/i);
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
