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
const HISTORICAL_GATE_SHA256 = "c52043f1190b0778a4efd34c9e1e9f6b8e6f9a3d08494ec69b54a19d46c0adac";
const CANOPY_AUTHORIZATION_SHA256 = "aee18d23ddc3766d6c6b9f1becaccef9bc70b19c59adc22a9c57d9e8ceeb10db";
const CANOPY_SPECIFICATION_SHA256 = "258ca3f94e30d484b53cc12e29c83beaf57998993edaea05e44f5a4924979efc";
const CANOPY_READBACK_SHA256 = "93e2d55f2de8763372f8d5c57a8a26fd109dd63dc842438b3b842bdb0f66dcd4";
const CANOPY_RUNNER_SHA256 = "99982d613a0ef908a88f1dfe468c541c61c2f9f09cad6fbf6768377543c5386d";
const CANOPY_OUTPUT = {
  specification: "ntems-canopy-cover-v1",
  path: "ntems-canopy-cover-v1/80c37461f4deccfdfffc26124e9064d53a94dde660b9f96194445870393af130/phase1-ntems-canopy-cover-v1/canopy-cover-2022.tif",
  sha256: "18cb7904cf9ec16ef602f7cb57c788dcdb49c2ef0719992abdc3366e4be1079e",
  byteLength: 13110248051,
  status: "verified",
};
const WHAT_CHANGED = [
  "The historical canopy-cover row recorded specification, run, and output as null before the later execution records existed.",
  "The repository now contains the unapproved ntems-canopy-cover-v1 execution specification, an owner-approved local execution authorization, the recorded runner binding, and a complete readback for one exact derived output.",
  "This successor corrects only those later specification, run, and output facts. It does not convert the execution specification into a production-admission target specification or admit the source or output.",
];
const REMAINING_BLOCKERS = [
  "Record and approve a distinct production-admission target canopy-cover specification before considering ingestion, release, production admission, or production eligibility.",
  "Complete the target specification's required validation and create separate ingestion, release, and production-admission records.",
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(new URL(`../${file}`, import.meta.url))).digest("hex");
}

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

export function validatePhase1NrcanCoverProcessingGateSupersession(supersession, historicalGate = read("data/phase1-nrcan-cover-processing-gate.json")) {
  assert.deepEqual(Object.keys(supersession).sort(), ["auditedAt", "canopyCover", "remainingBlockers", "schemaVersion", "status", "supersedes", "whatChanged"].sort());
  assert.equal(supersession.schemaVersion, "witness-tree/phase1-nrcan-cover-processing-gate-supersession/1");
  assert.equal(supersession.status, "supersedes-historical-gate-with-nonproduction-execution-evidence");
  assert.equal(supersession.auditedAt, "2026-08-31T00:00:00Z");
  assert.deepEqual(supersession.supersedes, {
    path: "data/phase1-nrcan-cover-processing-gate.json",
    sha256: HISTORICAL_GATE_SHA256,
    auditedAt: "2026-08-21T15:45:00Z",
    scope: "Historical Phase 1 NRCan cover processing snapshot. It remains unchanged.",
  });
  assert.equal(sha256(supersession.supersedes.path), supersession.supersedes.sha256);
  assert.equal(historicalGate.auditedAt, supersession.supersedes.auditedAt);
  assert.deepEqual(supersession.whatChanged, WHAT_CHANGED);

  const canopy = supersession.canopyCover;
  assert.deepEqual(Object.keys(canopy).sort(), ["executionAuthorization", "executionSpecification", "output", "productionAdmission", "productionAdmissionTargetSpecification", "productionEligible", "readback", "runner", "sourceRow"].sort());
  assert.equal(canopy.sourceRow, "ntems-canopy-cover");
  assert.deepEqual(canopy.executionSpecification, {
    id: "ntems-canopy-cover-v1",
    path: "data/phase1-production-transformation-specifications-v1.json",
    sha256: CANOPY_SPECIFICATION_SHA256,
    status: "unapproved-specification-only",
    meaning: "A checksum-bound proposed execution specification. Its file status does not make it a production-admission target specification.",
  });
  assert.equal(sha256(canopy.executionSpecification.path), canopy.executionSpecification.sha256);
  assert.deepEqual(canopy.productionAdmissionTargetSpecification, {
    present: false,
    meaning: "No production-admission target canopy-cover specification has been recorded or approved. The existing ntems-canopy-cover-v1 execution specification is not a substitute.",
  });
  assert.deepEqual(canopy.executionAuthorization, {
    path: "data/phase1-ntems-canopy-cover-execution-authorization.json",
    sha256: CANOPY_AUTHORIZATION_SHA256,
    status: "approved-owner-local-execution",
    readbackBoundSha256: "f0e1486a7817db5cdf7af3c13898073a202f1db4919320fa2b287c9e2103e47c",
    meaning: "The readback preserves the authorization bytes that applied when it was created; the current authorization checksum is recorded separately and does not rewrite that history.",
  });
  assert.equal(sha256(canopy.executionAuthorization.path), canopy.executionAuthorization.sha256);
  assert.deepEqual(canopy.runner, {
    path: "scripts/run-phase1-ntems-transform.mjs",
    sha256: CANOPY_RUNNER_SHA256,
    readbackBoundSha256: "09b1016849e0709e46ebad908eec0f01252d5e5eeed3e5cd2fcb712c2042dc90",
    meaning: "The readback preserves the runner bytes that produced the output; the current runner checksum is not retroactively bound to that run.",
  });
  assert.equal(sha256(canopy.runner.path), canopy.runner.sha256);
  assert.deepEqual(canopy.readback, {
    path: "data/ntems-canopy-cover-v1-readback-evidence-2026-08-26.json",
    sha256: CANOPY_READBACK_SHA256,
    status: "complete-readback-verified",
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
  });
  assert.equal(sha256(canopy.readback.path), canopy.readback.sha256);
  const readback = read(canopy.readback.path);
  assert.equal(readback.status, canopy.readback.status);
  assert.deepEqual(readback.claims, canopy.readback.claims);
  assert.equal(readback.authorization.path, canopy.executionAuthorization.path);
  assert.equal(readback.authorization.sha256, canopy.executionAuthorization.readbackBoundSha256);
  assert.equal(readback.runner.path, canopy.runner.path);
  assert.equal(readback.runner.sha256, canopy.runner.readbackBoundSha256);
  assert.deepEqual(canopy.output, CANOPY_OUTPUT);
  const output = readback.outputs.find(({ specification }) => specification === canopy.output.specification);
  assert.ok(output);
  assert.deepEqual({ specification: output.specification, path: output.output, sha256: output.outputSha256, byteLength: output.outputByteLength, status: output.status }, canopy.output);
  assert.equal(canopy.productionAdmission, false);
  assert.equal(canopy.productionEligible, false);
  assert.deepEqual(supersession.remainingBlockers, REMAINING_BLOCKERS);
  return supersession;
}

export function checkPhase1NrcanCoverProcessingGate() {
  const historicalGate = read("data/phase1-nrcan-cover-processing-gate.json");
  validatePhase1NrcanCoverProcessingGate(historicalGate);
  return validatePhase1NrcanCoverProcessingGateSupersession(read("data/phase1-nrcan-cover-processing-gate-supersession-2026-08-31.json"), historicalGate);
}

if (process.argv[1]?.endsWith("check-phase1-nrcan-cover-processing-gate.mjs")) {
  const supersession = checkPhase1NrcanCoverProcessingGate();
  console.log(`Phase 1 NRCan cover processing gate passed: ${supersession.supersedes.path} remains historical; its canopy-cover absence facts are superseded by execution evidence without production admission.`);
}
