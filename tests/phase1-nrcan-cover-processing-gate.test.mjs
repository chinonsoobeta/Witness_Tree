import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanCanopyCoverProfile } from "../scripts/check-nrcan-canopy-cover-profile.mjs";
import { checkPhase1NrcanCoverProcessingGate, validatePhase1NrcanCoverProcessingGate } from "../scripts/check-phase1-nrcan-cover-processing-gate.mjs";

const audit = checkPhase1NrcanCoverProcessingGate();

test("the NTEMS cover gate binds both rows to existing local/archive checks", () => {
  assert.equal(audit.rows.length, 2);
  assert.equal(audit.baseline.rawEvidenceNumerator, 14.25);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 38.7903226);
  assert.deepEqual(audit.rows.map(({ transformation }) => transformation.status), [
    "blocked-no-phase1-production-named-specification-and-output",
    "blocked-no-phase1-production-named-specification-and-output",
  ]);
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
  rejects((candidate) => { candidate.notice = candidate.notice.replace("Phase 1 production-admission", "approved").replace("A separately approved Phase 2 nonproduction method does not close these Phase 1 gates. ", ""); });
  rejects((candidate) => { candidate.rows[0].transformation.requiredBeforeExecution[0] = "Record and approve a versioned forest-mask method."; });
  rejects((candidate) => { candidate.rows[1].transformation.blockers[0] = "No approved canopy-cover method exists."; });
  assert.equal(validateNrcanCanopyCoverProfile(JSON.parse(readFileSync(new URL("../data/nrcan-canopy-cover-profile.json", import.meta.url), "utf8"))).productionEligible, false);
});
