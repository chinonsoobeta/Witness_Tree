import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validatePhase1ProductionSourceLedger } from "../scripts/check-phase1-production-source-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8"));
const inventory = JSON.parse(readFileSync(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8"));
const nbacProfile = JSON.parse(readFileSync(new URL("../data/phase1-nbac-profile-2026-08-27.json", import.meta.url), "utf8"));

test("canonical production ledger reconciles all 31 plan rows and only exact admitted rows", () => {
  assert.equal(validatePhase1ProductionSourceLedger(ledger, inventory), ledger);
  assert.equal(ledger.entries.length, 31);
  assert.equal(ledger.entries.filter((entry) => entry.productionEligible).length, 2);
  assert.equal(ledger.rawEvidenceNumerator, 17);
  assert.equal(ledger.entries.reduce((sum, entry) => sum + entry.rawCredit, 0), ledger.rawEvidenceNumerator);
  assert.deepEqual(ledger.formalProgress, {
    baselinePercentagePoints: 25,
    rawEvidenceWeightPercentagePoints: 30,
    completeLedgerWeightPercentagePoints: 45,
    percentage: 41.4516129,
    notice: "This is an evidence-tracking score only. It does not grant source-ledger admission, transformation, analysis, ingestion, public release, production admission, or production eligibility."
  });
  const bcWildfire = ledger.entries.find((entry) => entry.id === "bc-wildfire");
  assert.equal(bcWildfire.evidenceState, "remote-verified-archived-profiled");
  assert.equal(bcWildfire.rawCredit, 1);
  assert.ok(bcWildfire.evidenceRefs.includes("data/bc-wildfire-geometry-policy-2026-08-14.json"));
  assert.equal(bcWildfire.proof.immutableArchive, true);
  assert.equal(bcWildfire.proof.productionAdmission, false);
  const nrcanHarvest = ledger.entries.find((entry) => entry.id === "ntems-forest-harvest");
  assert.equal(nrcanHarvest.evidenceState, "remote-verified-archived-profiled");
  assert.equal(nrcanHarvest.rawCredit, 1);
  assert.ok(nrcanHarvest.evidenceRefs.includes("data/nrcan-harvest-remote-archive-evidence.json"));
  assert.equal(nrcanHarvest.proof.immutableArchive, true);
  assert.equal(nrcanHarvest.productionEligible, false);
  const canopy = ledger.entries.find((entry) => entry.id === "ntems-canopy-height");
  assert.equal(canopy.evidenceState, "remote-verified-archived-profiled");
  assert.equal(canopy.rawCredit, 1);
  assert.ok(canopy.evidenceRefs.includes("data/nrcan-canopy-height-remote-archive-evidence.json"));
  assert.equal(canopy.proof.immutableArchive, true);
  assert.equal(canopy.productionEligible, false);
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
    const federal = ledger.entries.find((entry) => entry.id === id);
    assert.equal(federal.evidenceState, "production-admitted");
    assert.equal(federal.rawCredit, 1);
    assert.equal(federal.proof.immutableArchive, true);
    assert.ok(federal.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json"));
    assert.equal(federal.proof.productionAdmission, true);
    assert.equal(federal.productionEligible, true);
    assert.ok(federal.evidenceRefs.includes("data/phase1-federal-electoral-production-admission.json"));
  }
  const plvi = ledger.entries.find((entry) => entry.id === "ab-primary-land-vegetation");
  assert.equal(plvi.evidenceState, "remote-verified-archived-profiled");
  assert.equal(plvi.rawCredit, 1);
  assert.equal(plvi.proof.immutableArchive, true);
  assert.equal(plvi.proof.productionAdmission, false);
  assert.ok(plvi.evidenceRefs.includes("data/alberta-plvi-immutable-promotion-preparation.json"));
  assert.ok(plvi.evidenceRefs.includes("data/alberta-plvi-immutable-promotion-evidence.json"));
  const qcOriginalCurrent = ledger.entries.find((entry) => entry.id === "qc-original-current-inventory");
  assert.equal(qcOriginalCurrent.evidenceState, "remote-verified-archived-profiled");
  assert.equal(qcOriginalCurrent.rawCredit, 1);
  assert.deepEqual(qcOriginalCurrent.evidenceRefs, ["data/qc-original-current-inventory-profile.json", "data/staged-acquisitions.json", "data/qc-immutable-promotion-attestation.json"]);
  assert.equal(qcOriginalCurrent.proof.immutableArchive, true);
  const qcCurrent = ledger.entries.find((entry) => entry.id === "qc-current-ecoforest");
  assert.equal(qcCurrent.evidenceState, "remote-verified-archived-profiled");
  assert.equal(qcCurrent.rawCredit, 1);
  assert.ok(qcCurrent.evidenceRefs.includes("data/qc-immutable-promotion-attestation.json"));
  assert.equal(qcCurrent.proof.immutableArchive, true);
  const qcFourthInventory = ledger.entries.find((entry) => entry.id === "qc-fourth-inventory");
  assert.equal(qcFourthInventory.evidenceState, "remote-verified-archived-profiled");
  assert.equal(qcFourthInventory.rawCredit, 1);
  assert.deepEqual(qcFourthInventory.evidenceRefs, ["data/qc-fourth-inventory-evidence.json", "data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json"]);
  assert.equal(qcFourthInventory.proof.immutableArchive, true);
  assert.equal(qcFourthInventory.proof.productionAdmission, false);
  assert.equal(qcFourthInventory.productionEligible, false);
  const nbac = ledger.entries.find((entry) => entry.id === "cwfis-historical");
  assert.ok(nbac.evidenceRefs.includes("data/nbac-archive-receipt-2026-08-27.json"));
  assert.equal(nbac.evidenceState, "local-verified-profiled");
  assert.equal(nbac.rawCredit, 0.75);
  assert.equal(nbac.proof.immutableArchive, false);
  assert.equal(nbac.productionEligible, false);
});

test("every evidence reference stays inside the repository and names a regular non-symlink file", () => {
  for (const reference of [
    "data/../data/phase1-source-inventory.json",
    path.join(ROOT, "data", "phase1-source-inventory.json"),
    "data/phase1-source-inventory\0.json",
  ]) {
    const candidate = structuredClone(ledger);
    candidate.entries[0].evidenceRefs = [reference];
    assert.throws(() => validatePhase1ProductionSourceLedger(candidate, inventory), /safe repository-relative paths/i, reference);
  }

  const outsideRoot = mkdtempSync(path.join(tmpdir(), "phase1-ledger-outside-"));
  const outsideFile = path.join(outsideRoot, "evidence.json");
  const linkName = `.phase1-ledger-parent-${process.pid}-${Date.now()}`;
  const link = path.join(ROOT, "data", linkName);
  writeFileSync(outsideFile, "{}\n");
  symlinkSync(outsideRoot, link, "dir");
  try {
    const candidate = structuredClone(ledger);
    candidate.entries[0].evidenceRefs = [`data/${linkName}/evidence.json`];
    assert.throws(() => validatePhase1ProductionSourceLedger(candidate, inventory), /safe repository-relative paths/i);
  } finally {
    rmSync(link, { force: true });
    rmSync(outsideRoot, { force: true, recursive: true });
  }
});

test("admission-looking references on unadmitted rows are rejected after record validation", () => {
  const candidate = structuredClone(ledger);
  const row = candidate.entries.find((entry) => entry.id === "bc-wildfire");
  row.evidenceRefs.push("data/phase1-federal-electoral-production-admission.json");
  assert.throws(() => validatePhase1ProductionSourceLedger(candidate, inventory), /unadmitted ledger rows/i);
});

test("each admission record must match every ledger row that references it", () => {
  const candidate = structuredClone(ledger);
  const row = candidate.entries.find((entry) => entry.id === "bc-wildfire");
  row.evidenceState = "production-admitted";
  row.productionEligible = true;
  for (const proof of Object.keys(row.proof)) row.proof[proof] = true;
  row.evidenceRefs.push("data/phase1-federal-electoral-production-admission.json");
  assert.throws(() => validatePhase1ProductionSourceLedger(candidate, inventory), /exactly match ledger rows referencing it/i);
});

test("ledger fails closed for omission, credit inflation, a missing proof, or inferred production admission", () => {
  assert.throws(() => validatePhase1ProductionSourceLedger({ ...ledger, entries: ledger.entries.slice(1) }, inventory), /every required production row/i);
  const credit = structuredClone(ledger); credit.entries[0].rawCredit = 0.75;
  assert.throws(() => validatePhase1ProductionSourceLedger(credit, inventory), /fixed raw-evidence credit/i);
  const proof = structuredClone(ledger); delete proof.entries[0].proof.checksum;
  assert.throws(() => validatePhase1ProductionSourceLedger(proof, inventory), /production proof/i);
  const admitted = structuredClone(ledger); admitted.entries[0].proof.productionAdmission = true;
  assert.throws(() => validatePhase1ProductionSourceLedger(admitted, inventory), /requires the admitted state/i);
  const staleTotal = structuredClone(ledger); staleTotal.rawEvidenceNumerator = 7.5;
  assert.throws(() => validatePhase1ProductionSourceLedger(staleTotal, inventory), /computed from its row states/i);
  const staleProgress = structuredClone(ledger); staleProgress.formalProgress.percentage = 30;
  assert.throws(() => validatePhase1ProductionSourceLedger(staleProgress, inventory), /Formal progress must be recomputed/i);
  const staleStatus = structuredClone(ledger); staleStatus.status = "admitted";
  assert.throws(() => validatePhase1ProductionSourceLedger(staleStatus, inventory), /status does not match admitted rows/i);
});

test("NBAC ledger proof is cross-validated against the exact profile", () => {
  const proofDrift = structuredClone(ledger);
  proofDrift.entries.find(({ id }) => id === "cwfis-historical").proof.checksum = false;
  assert.throws(() => validatePhase1ProductionSourceLedger(proofDrift, inventory), /NBAC ledger proof/);
  const profileDrift = structuredClone(nbacProfile);
  profileDrift.artifacts.payload.sha256 = "0".repeat(64);
  assert.throws(() => validatePhase1ProductionSourceLedger(ledger, inventory, ROOT, profileDrift));
});

test("NBAC receipt is required but cannot upgrade the ledger archive proof", () => {
  const missingReceipt = structuredClone(ledger);
  const row = missingReceipt.entries.find(({ id }) => id === "cwfis-historical");
  row.evidenceRefs = row.evidenceRefs.filter((reference) => !reference.includes("nbac-archive-receipt"));
  assert.throws(() => validatePhase1ProductionSourceLedger(missingReceipt, inventory), /primary-readback receipt/i);

  const archiveClaim = structuredClone(ledger);
  archiveClaim.entries.find(({ id }) => id === "cwfis-historical").proof.immutableArchive = true;
  assert.throws(() => validatePhase1ProductionSourceLedger(archiveClaim, inventory), /Local evidence must remain profile\/re-fetch evidence/i);
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
