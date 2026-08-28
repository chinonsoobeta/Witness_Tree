import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OPTIONAL_ROW_IDS, REQUIRED_FIELDS, validatePhase1SourceLedgerFieldAudit } from "../scripts/check-phase1-source-ledger-field-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const audit = read("data/phase1-source-ledger-field-audit.json");
const ledger = read("data/phase1-production-source-ledger.json");
const inventory = read("data/phase1-source-inventory.json");
const FEDERAL_ADMITTED_ROW_IDS = ["fed-2023-ridings", "elections-canada-45th-files"];

test("field audit accounts for the exact 31 canonical rows and every required field", () => {
  assert.equal(validatePhase1SourceLedgerFieldAudit(audit, ledger, inventory), audit);
  assert.deepEqual(audit.requiredFields, REQUIRED_FIELDS);
  assert.equal(audit.rows.length, 31);
  assert.equal(audit.coreRequiredRowCount, 22);
  assert.equal(audit.optionalTrackedRowCount, 9);
  assert.equal(audit.coreCompleteRowCount, 2);
  assert.equal(audit.optionalCompleteRowCount, 0);
  assert.equal(audit.completeRowCount, 2);
  assert.equal(audit.coreAdmittedRowCount, 2);
  assert.equal(audit.optionalAdmittedRowCount, 0);
  assert.equal(audit.admittedRowCount, 2);
  assert.equal(audit.status, "partially-admitted");
  assert.equal(audit.phaseComplete, false);
  assert.equal(audit.productionAdmissionAllowed, false);
  for (const row of audit.rows) {
    const isFederalAdmitted = FEDERAL_ADMITTED_ROW_IDS.includes(row.id);
    assert.deepEqual(Object.keys(row.fields).sort(), [...REQUIRED_FIELDS].sort());
    assert.equal(row.fields.admissionState.status, "verified");
    assert.equal(row.fields.admissionState.value, isFederalAdmitted);
    assert.equal(row.fields.admissionState.evidenceBinding.expectedValue, isFederalAdmitted);
    assert.equal(row.classification, OPTIONAL_ROW_IDS.includes(row.id) ? "optional" : "core");
    assert.equal(row.canonicalProductionEligible, isFederalAdmitted);
    assert.equal(row.canonicalProductionAdmission, isFederalAdmitted);
    assert.equal(row.complete, isFederalAdmitted);
  }
});

test("field audit carries only directly bound source-profile facts", () => {
  const cwfis = audit.rows.find((row) => row.id === "cwfis-current");
  assert.equal(cwfis.fields.publisher.status, "verified");
  assert.equal(cwfis.fields.publisher.evidenceBinding.path, "data/cwfis-current-active-fires-profile.json");
  // datasetTitle is bound now. redistributionStatus stands in for the same point:
  // a field no record states literally stays missing rather than being derived.
  assert.equal(cwfis.fields.redistributionStatus.status, "missing");

  const qcOriginal = audit.rows.find((row) => row.id === "qc-original-current-inventory");
  assert.equal(qcOriginal.fields.checksum.value, "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61");
  assert.equal(qcOriginal.fields.checksum.evidenceBinding.jsonPointer, "/rawArchive/sha256");

  const staleProfileHash = structuredClone(audit);
  staleProfileHash.rows.find((row) => row.id === "cwfis-current").fields.publisher.evidenceBinding.sha256 = "0".repeat(64);
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(staleProfileHash, ledger, inventory), /stale evidence-file SHA-256/i);
});

test("field audit exhaustively records the directly evidenced fields for every archive-evidenced core row", () => {
  const expectedVerifiedCounts = {
    "ntems-annual-land-cover": 10,
    "ntems-forest-harvest": 15,
    "ntems-canopy-cover": 15,
    "ntems-canopy-height": 15,
    "cwfis-current": 16,
    "bc-wildfire": 16,
    "ab-wildfire": 15,
    "on-fire-disturbance": 15,
    "qc-current-ecoforest": 8,
    "qc-original-current-inventory": 15,
    "qc-fourth-inventory": 11,
    "ab-avi-crown": 15,
    "ab-avi-post-harvest": 13,
    "ab-primary-land-vegetation": 14,
    "fed-2023-ridings": 22,
    "elections-canada-45th-files": 22
  };
  for (const [id, count] of Object.entries(expectedVerifiedCounts)) {
    const row = audit.rows.find((candidate) => candidate.id === id);
    assert.ok(row, `missing required archive-evidenced row ${id}`);
    assert.equal(Object.values(row.fields).filter((field) => field.status === "verified").length, count, id);
    assert.equal(row.complete, count === REQUIRED_FIELDS.length, id);
  }

  const stagedTamper = structuredClone(audit);
  stagedTamper.rows.find((row) => row.id === "ntems-forest-harvest").fields.publisher.evidenceBinding.expectedValue = "Invented publisher";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(stagedTamper, ledger, inventory), /does not match its bound evidence value/i);
});

test("field audit fails closed for omitted rows, omitted fields, and stale canonical references", () => {
  const omittedRow = structuredClone(audit);
  omittedRow.rows.pop();
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(omittedRow, ledger, inventory), /exactly 31 rows|canonical production-row order/i);

  const omittedField = structuredClone(audit);
  delete omittedField.rows[0].fields.checksum;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(omittedField, ledger, inventory), /every required field exactly once/i);

  const staleReference = structuredClone(audit);
  staleReference.rows[0].canonicalEvidenceRefs = [];
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(staleReference, ledger, inventory), /match the canonical ledger evidence references/i);

  const droppedOptional = structuredClone(audit);
  droppedOptional.rows = droppedOptional.rows.filter((row) => row.id !== OPTIONAL_ROW_IDS[0]);
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(droppedOptional, ledger, inventory), /exactly 31 rows|canonical production-row order/i);
});

test("field audit rejects invented values, unsupported evidence, and complete/admitted claims", () => {
  const inventedValue = structuredClone(audit);
  inventedValue.rows[0].fields.licence = { status: "verified", value: "OGL", evidenceRefs: [] };
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(inventedValue, ledger, inventory), /needs at least one evidence reference/i);

  const inventedField = structuredClone(audit);
  inventedField.rows[0].fields.publisher = { status: "verified", value: "Invented Publisher", evidenceRefs: ["data/not-present.json"] };
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(inventedField, ledger, inventory), /missing repository file/i);

  const unrelatedEvidence = structuredClone(audit);
  unrelatedEvidence.rows[0].fields.publisher = {
    status: "verified",
    value: "Invented Publisher",
    evidenceRefs: ["data/phase1-production-source-ledger.json"],
    evidenceBinding: {
      path: "data/phase1-production-source-ledger.json",
      sha256: audit.rows[0].fields.admissionState.evidenceBinding.sha256,
      jsonPointer: "/entries/0/proof/productionAdmission",
      expectedValue: false
    }
  };
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(unrelatedEvidence, ledger, inventory), /does not match its bound evidence value/i);

  const falselyComplete = structuredClone(audit);
  falselyComplete.phaseComplete = true;
  falselyComplete.status = "complete";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(falselyComplete, ledger, inventory), /cannot be marked complete|cannot claim phase completion|phase-complete state must be derived/i);

  const falselyAdmitted = structuredClone(audit);
  falselyAdmitted.productionAdmissionAllowed = true;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(falselyAdmitted, ledger, inventory), /cannot claim phase completion or admission|production-admission state must be derived/i);

  const revokedAdmission = structuredClone(audit);
  const revokedFederalRow = revokedAdmission.rows.find((row) => row.id === FEDERAL_ADMITTED_ROW_IDS[0]);
  revokedFederalRow.fields.admissionState.value = false;
  revokedFederalRow.fields.admissionState.evidenceBinding.expectedValue = false;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(revokedAdmission, ledger, inventory), /does not match its bound evidence value|admitted field-audit row.*explicitly true/i);

  const canonicalAdmission = structuredClone(ledger);
  canonicalAdmission.entries[0].productionEligible = true;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(audit, canonicalAdmission, inventory), /stale production eligibility or admission|canonical production ledger must remain blocked|cannot be eligible or admitted/i);

  const reclassifiedOptional = structuredClone(audit);
  reclassifiedOptional.rows.find((row) => row.id === OPTIONAL_ROW_IDS[0]).classification = "core";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(reclassifiedOptional, ledger, inventory), /must be classified as optional/i);
});

test("missing fields cannot carry asserted values or omit the missing reason", () => {
  const assertedMissing = structuredClone(audit);
  assertedMissing.rows[0].fields.checksum.value = "sha256:invented";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(assertedMissing, ledger, inventory), /cannot carry an asserted value/i);

  const unexplainedMissing = structuredClone(audit);
  delete unexplainedMissing.rows[0].fields.schema.reason;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(unexplainedMissing, ledger, inventory), /needs a reason/i);
});

test("field records and evidence bindings reject uncontracted or unsafe fields", () => {
  const extraField = structuredClone(audit);
  extraField.rows[0].fields.publisher.unreviewed = true;
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(extraField, ledger, inventory), /unexpected fields/i);

  const extraBindingField = structuredClone(audit);
  extraBindingField.rows[0].fields.publisher.evidenceBinding.provider = "filesystem";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(extraBindingField, ledger, inventory), /unexpected evidence-binding field/i);

  const traversal = structuredClone(audit);
  traversal.rows[0].fields.publisher.evidenceRefs[0] = "data/../data/phase1-production-source-ledger.json";
  assert.throws(() => validatePhase1SourceLedgerFieldAudit(traversal, ledger, inventory), /safe repository data paths/i);
});
