import assert from "node:assert/strict";
import test from "node:test";
import { validatePhase1ProductionTransformationSpecificationsV1 } from "../scripts/check-phase1-production-transformation-specifications-v1.mjs";
test("Phase 1 named transformation specifications are checksum-bound, unapproved, and non-admitting", () => {
  const record = validatePhase1ProductionTransformationSpecificationsV1();
  assert.equal(record.specifications[0].output.checksumSha256, null);
  assert.equal(record.specifications.at(-1).geometryAndGrid.geometryPolicy.includes("do not dissolve"), true);
});
test("specifications reject a claimed unexecuted output checksum and input-binding drift", () => {
  const record = validatePhase1ProductionTransformationSpecificationsV1();
  const claimed = structuredClone(record); claimed.specifications[0].output.checksumSha256 = "a".repeat(64);
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(claimed));
  const drift = structuredClone(record); drift.specifications[1].inputBindings[0].sha256 = "b".repeat(64);
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(drift));
});
test("specifications reject scope, output-path, and owner-admission tampering", () => {
  const record = validatePhase1ProductionTransformationSpecificationsV1();
  const scope = structuredClone(record); scope.specifications[0].sourceLedgerRows = ["ntems-canopy-cover"];
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(scope));
  const classes = structuredClone(record); classes.specifications[0].selection.includeClassValues = [20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230, 255];
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(classes));
  const path = structuredClone(record); path.specifications.at(-1).output.path = "derived/elsewhere/output.gpkg";
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(path));
  const admission = structuredClone(record); admission.ownerDecisionReadiness.residualBlockers = [];
  assert.throws(() => validatePhase1ProductionTransformationSpecificationsV1(admission));
});
