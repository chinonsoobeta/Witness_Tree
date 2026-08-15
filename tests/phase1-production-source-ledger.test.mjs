import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1ProductionSourceLedger } from "../scripts/check-phase1-production-source-ledger.mjs";

const ledger = JSON.parse(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8"));
const inventory = JSON.parse(readFileSync(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8"));

test("canonical production ledger reconciles all 31 plan rows without runtime production admission", () => {
  assert.equal(validatePhase1ProductionSourceLedger(ledger, inventory), ledger);
  assert.equal(ledger.entries.length, 31);
  assert.equal(ledger.entries.filter((entry) => entry.productionEligible).length, 0);
  assert.equal(ledger.rawEvidenceNumerator, 13.75);
  assert.equal(ledger.entries.reduce((sum, entry) => sum + entry.rawCredit, 0), ledger.rawEvidenceNumerator);
  assert.deepEqual(ledger.formalProgress, {
    baselinePercentagePoints: 25,
    rawEvidenceWeightPercentagePoints: 30,
    completeLedgerWeightPercentagePoints: 45,
    percentage: 38.3064516,
    notice: "This is an evidence-tracking score only. It does not grant source-ledger admission, transformation, analysis, ingestion, public release, production admission, or production eligibility."
  });
  const bcWildfire = ledger.entries.find((entry) => entry.id === "bc-wildfire");
  assert.equal(bcWildfire.evidenceState, "local-verified-profiled");
  assert.equal(bcWildfire.rawCredit, 0.75);
  assert.ok(bcWildfire.evidenceRefs.includes("data/bc-wildfire-geometry-policy-2026-08-14.json"));
  assert.equal(bcWildfire.proof.immutableArchive, false);
  assert.equal(bcWildfire.proof.productionAdmission, false);
  const plvi = ledger.entries.find((entry) => entry.id === "ab-primary-land-vegetation");
  assert.equal(plvi.evidenceState, "remote-verified-archived-profiled");
  assert.equal(plvi.rawCredit, 1);
  assert.equal(plvi.proof.immutableArchive, true);
  assert.equal(plvi.proof.productionAdmission, false);
  assert.ok(plvi.evidenceRefs.includes("data/alberta-plvi-immutable-promotion-preparation.json"));
  assert.ok(plvi.evidenceRefs.includes("data/alberta-plvi-immutable-promotion-evidence.json"));
  const qcOriginalCurrent = ledger.entries.find((entry) => entry.id === "qc-original-current-inventory");
  assert.equal(qcOriginalCurrent.evidenceState, "local-verified-profiled");
  assert.equal(qcOriginalCurrent.rawCredit, 0.75);
  assert.deepEqual(qcOriginalCurrent.evidenceRefs, ["data/qc-original-current-inventory-profile.json", "data/staged-acquisitions.json"]);
  assert.equal(qcOriginalCurrent.proof.immutableArchive, false);
  const qcFourthInventory = ledger.entries.find((entry) => entry.id === "qc-fourth-inventory");
  assert.equal(qcFourthInventory.evidenceState, "local-verified-profiled");
  assert.equal(qcFourthInventory.rawCredit, 0.75);
  assert.deepEqual(qcFourthInventory.evidenceRefs, ["data/qc-fourth-inventory-evidence.json"]);
  assert.equal(qcFourthInventory.proof.immutableArchive, false);
  assert.equal(qcFourthInventory.proof.productionAdmission, false);
  assert.equal(qcFourthInventory.productionEligible, false);
});

test("ledger fails closed for omission, credit inflation, a missing proof, or inferred production admission", () => {
  assert.throws(() => validatePhase1ProductionSourceLedger({ ...ledger, entries: ledger.entries.slice(1) }, inventory), /every required production row/i);
  const credit = structuredClone(ledger); credit.entries[0].rawCredit = 0.75;
  assert.throws(() => validatePhase1ProductionSourceLedger(credit, inventory), /fixed raw-evidence credit/i);
  const proof = structuredClone(ledger); delete proof.entries[0].proof.checksum;
  assert.throws(() => validatePhase1ProductionSourceLedger(proof, inventory), /production proof/i);
  const admitted = structuredClone(ledger); admitted.entries[0].proof.productionAdmission = true;
  assert.throws(() => validatePhase1ProductionSourceLedger(admitted, inventory), /cannot be inferred/i);
  const staleTotal = structuredClone(ledger); staleTotal.rawEvidenceNumerator = 7.5;
  assert.throws(() => validatePhase1ProductionSourceLedger(staleTotal, inventory), /computed from its row states/i);
  const staleProgress = structuredClone(ledger); staleProgress.formalProgress.percentage = 30;
  assert.throws(() => validatePhase1ProductionSourceLedger(staleProgress, inventory), /Formal progress must be recomputed/i);
});

test("Ontario FRI is explicitly access-blocked by its official Term 2 record", () => {
  const fri = ledger.entries.find((entry) => entry.id === "on-fri");
  assert.equal(fri.evidenceState, "access-blocked");
  assert.deepEqual(fri.evidenceRefs, ["data/ontario-fri-term2-access-block.json"]);
  assert.equal(fri.rawCredit, 0);
  assert.equal(fri.productionEligible, false);
  const invented = structuredClone(ledger);
  const inventedFri = invented.entries.find((entry) => entry.id === "on-fri");
  inventedFri.evidenceState = "local-verified-profiled";
  inventedFri.rawCredit = 0.75;
  invented.rawEvidenceNumerator = 11.25;
  assert.throws(() => validatePhase1ProductionSourceLedger(invented, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
});

test("Indian reserve geometry remains authority, rights, and engagement blocked", () => {
  const reserves = ledger.entries.find((entry) => entry.id === "indian-reserves");
  assert.equal(reserves.evidenceState, "access-blocked");
  assert.deepEqual(reserves.evidenceRefs, ["data/indian-reserves-authority-access-block.json", "data/source-candidates.json"]);
  assert.equal(reserves.rawCredit, 0);
  assert.equal(reserves.productionEligible, false);
  const invented = structuredClone(ledger);
  const inventedReserves = invented.entries.find((entry) => entry.id === "indian-reserves");
  inventedReserves.evidenceState = "local-verified-profiled";
  inventedReserves.rawCredit = 0.75;
  invented.rawEvidenceNumerator = 11.25;
  assert.throws(() => validatePhase1ProductionSourceLedger(invented, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
});

test("First Nation reserve geometry remains blocked and cannot infer a point or local-profile admission", () => {
  const reserves = ledger.entries.find((entry) => entry.id === "first-nation-reserves");
  assert.equal(reserves.evidenceState, "access-blocked");
  assert.deepEqual(reserves.evidenceRefs, ["data/first-nation-reserves-authority-access-block.json"]);
  assert.equal(reserves.rawCredit, 0);
  assert.equal(reserves.productionEligible, false);
  const invented = structuredClone(ledger);
  const inventedReserves = invented.entries.find((entry) => entry.id === "first-nation-reserves");
  inventedReserves.evidenceState = "local-verified-profiled";
  inventedReserves.rawCredit = 0.75;
  invented.rawEvidenceNumerator = 11.25;
  assert.throws(() => validatePhase1ProductionSourceLedger(invented, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
});

test("Historic treaty mapping remains blocked and cannot infer legal or local-profile geometry", () => {
  const treaties = ledger.entries.find((entry) => entry.id === "historic-treaties");
  assert.equal(treaties.evidenceState, "access-blocked");
  assert.deepEqual(treaties.evidenceRefs, ["data/historic-treaties-authority-access-block.json"]);
  assert.equal(treaties.rawCredit, 0);
  assert.equal(treaties.productionEligible, false);
  const invented = structuredClone(ledger); const row = invented.entries.find((entry) => entry.id === "historic-treaties");
  row.evidenceState = "local-verified-profiled"; row.rawCredit = 0.75; invented.rawEvidenceNumerator = 11.25;
  assert.throws(() => validatePhase1ProductionSourceLedger(invented, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
});

test("Modern treaty mapping remains blocked and cannot infer legal or local-profile geometry", () => {
  const treaties = ledger.entries.find((entry) => entry.id === "modern-treaties");
  assert.equal(treaties.evidenceState, "access-blocked");
  assert.deepEqual(treaties.evidenceRefs, ["data/modern-treaties-authority-access-block.json", "data/source-candidates.json"]);
  assert.equal(treaties.rawCredit, 0); assert.equal(treaties.productionEligible, false);
  const invented = structuredClone(ledger); const row = invented.entries.find((entry) => entry.id === "modern-treaties");
  row.evidenceState = "local-verified-profiled"; row.rawCredit = 0.75; invented.rawEvidenceNumerator = 11.25;
  assert.throws(() => validatePhase1ProductionSourceLedger(invented, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
});
