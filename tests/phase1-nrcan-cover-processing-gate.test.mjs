import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanCanopyCoverProfile } from "../scripts/check-nrcan-canopy-cover-profile.mjs";
import { checkPhase1NrcanCoverProcessingGate, validatePhase1NrcanCoverProcessingGate, validatePhase1NrcanCoverProcessingGateSupersession } from "../scripts/check-phase1-nrcan-cover-processing-gate.mjs";

const supersession = checkPhase1NrcanCoverProcessingGate();
const audit = JSON.parse(readFileSync(new URL("../data/phase1-nrcan-cover-processing-gate.json", import.meta.url), "utf8"));
const ledger = JSON.parse(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8"));

test("the NTEMS cover gate binds both rows to existing local/archive checks", () => {
  assert.equal(audit.rows.length, 2);
  assert.equal(audit.baseline.rawEvidenceNumerator, 14.25);
  assert.equal(audit.baseline.auditedAt, "2026-08-21T15:45:00Z");
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 38.7903226);
  assert.deepEqual(audit.rows.map(({ transformation }) => transformation.status), [
    "blocked-no-phase1-production-named-specification-and-output",
    "blocked-no-phase1-production-named-specification-and-output",
  ]);
});

test("the dated successor binds the later canopy-cover execution evidence without production admission", () => {
  assert.equal(supersession.supersedes.auditedAt, "2026-08-21T15:45:00Z");
  assert.equal(supersession.canopyCover.executionSpecification.id, "ntems-canopy-cover-v1");
  assert.equal(supersession.canopyCover.executionSpecification.status, "unapproved-specification-only");
  assert.equal(supersession.canopyCover.productionAdmissionTargetSpecification.present, false);
  assert.equal(supersession.canopyCover.readback.claims.transformed, true);
  assert.equal(supersession.canopyCover.output.sha256, "18cb7904cf9ec16ef602f7cb57c788dcdb49c2ef0719992abdc3366e4be1079e");
  assert.equal(supersession.canopyCover.productionAdmission, false);
  assert.equal(supersession.canopyCover.productionEligible, false);
});

test("the successor fails closed if it blurs execution evidence into production admission", () => {
  const rejects = (mutate) => assert.throws(() => {
    const candidate = structuredClone(supersession);
    mutate(candidate);
    validatePhase1NrcanCoverProcessingGateSupersession(candidate, audit);
  });
  rejects((candidate) => { candidate.canopyCover.productionAdmissionTargetSpecification.present = true; });
  rejects((candidate) => { candidate.canopyCover.productionEligible = true; });
  rejects((candidate) => { candidate.canopyCover.output.sha256 = "a".repeat(64); });
  rejects((candidate) => { candidate.canopyCover.readback.sha256 = "a".repeat(64); });
  rejects((candidate) => { candidate.whatChanged[0] = "Something changed."; });
  rejects((candidate) => { candidate.remainingBlockers = []; });
  rejects((candidate) => { candidate.canopyCover.productionRelease = true; });
});

test("the gate fails closed if a transformation, output, or credit is invented", () => {
  const source = JSON.parse(readFileSync(new URL("../data/phase1-nrcan-cover-processing-gate.json", import.meta.url), "utf8"));
  const rejects = (mutate) => assert.throws(() => {
    const candidate = structuredClone(source);
    mutate(candidate);
    validatePhase1NrcanCoverProcessingGate(candidate);
  });
  rejects((candidate) => { candidate.rows[0].namedTransformations = [{ id: "invented-v1" }]; });
  rejects((candidate) => { candidate.rows[1].transformation.output = { sha256: "a".repeat(64) }; });
  rejects((candidate) => { candidate.rows[0].productionEligible = true; });
  rejects((candidate) => { candidate.baseline.scoreDelta.rawCredit = 1; });
  rejects((candidate) => { candidate.baseline.auditedAt = "2026-08-21T15:45:01Z"; });
  rejects((candidate) => { candidate.notice = candidate.notice.replace("Phase 1 production-admission", "approved").replace("A separately approved Phase 2 nonproduction method does not close these Phase 1 gates. ", ""); });
  rejects((candidate) => { candidate.rows[0].transformation.requiredBeforeExecution[0] = "Record and approve a versioned forest-mask method."; });
  rejects((candidate) => { candidate.rows[1].transformation.blockers[0] = "No approved canopy-cover method exists."; });
  assert.equal(validateNrcanCanopyCoverProfile(JSON.parse(readFileSync(new URL("../data/nrcan-canopy-cover-profile.json", import.meta.url), "utf8"))).productionEligible, false);
});

test("the gate keeps its bound historical baseline after the later NBAC profile and federal admission", () => {
  assert.equal(validatePhase1NrcanCoverProcessingGate(audit, ledger), audit);
  assert.deepEqual(audit.baseline, {
    auditedAt: "2026-08-21T15:45:00Z",
    productionRows: 31,
    rawEvidenceNumerator: 14.25,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 38.7903226,
    immutableArchiveCompleteRows: 7,
    productionAdmissionCompleteRows: 0,
    productionEligibleRows: 0,
    scoreDelta: { rawCredit: 0, formalPercentagePoints: 0 },
  });
});

test("the gate rejects a corrupted later NBAC ledger transition", () => {
  const corrupted = structuredClone(ledger);
  corrupted.entries.find(({ id }) => id === "cwfis-historical").rawCredit = 0.5;
  assert.throws(() => validatePhase1NrcanCoverProcessingGate(audit, corrupted), /bound historical state|verified later state/i);
});

test("the gate rejects a corrupted later federal admission instead of treating it as historical state", () => {
  const corrupted = structuredClone(ledger);
  corrupted.entries.find(({ id }) => id === "fed-2023-ridings").productionEligible = false;
  assert.throws(() => validatePhase1NrcanCoverProcessingGate(audit, corrupted), /verified later state|later federal admission/i);
});
