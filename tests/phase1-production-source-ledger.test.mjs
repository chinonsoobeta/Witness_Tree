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
  assert.equal(ledger.rawEvidenceNumerator, 11.25);
  assert.equal(ledger.entries.reduce((sum, entry) => sum + entry.rawCredit, 0), ledger.rawEvidenceNumerator);
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
