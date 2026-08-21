import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePhase2RealDataOwnerDecision } from "../scripts/check-phase2-real-data-owner-decision.mjs";

const fixture = JSON.parse(await readFile(new URL("../data/phase2-real-data-owner-decision.json", import.meta.url), "utf8"));
const clone = () => structuredClone(fixture);
const pending = () => {
  const record = clone();
  record.status = "owner-decision-required";
  record.claims.approvalRecorded = false;
  record.ownerDecision = Object.fromEntries(Object.keys(record.ownerDecision).map((key) => [key, key === "status" ? "pending" : null]));
  return record;
};

test("recorded Phase 2 decision is explicit, bounded, and non-production", () => {
  const record = validatePhase2RealDataOwnerDecision(clone(), { requireApproval: true });
  assert.equal(record.ownerDecision.ownerName, "Chinonso Obeta");
  assert.equal(record.ownerDecision.forestCrosswalkOption, "conservative-treed-upland-v1");
  assert.equal(record.claims.realTransformationRun, false);
  assert.equal(record.claims.productionEligible, false);
});

test("pending state and inferred approval remain fail closed", () => {
  assert.throws(() => validatePhase2RealDataOwnerDecision(pending(), { requireApproval: true }), /has not been recorded/);
  const statusOnly = pending();
  statusOnly.ownerDecision.status = "approved-for-versioned-nonproduction-processing";
  assert.throws(() => validatePhase2RealDataOwnerDecision(statusOnly), /owner-decision-recorded/);

  const claimOnly = pending();
  claimOnly.claims.approvalRecorded = true;
  assert.throws(() => validatePhase2RealDataOwnerDecision(claimOnly), /false/);
});

test("the package rejects missing geography gates and expanded compute", () => {
  const missing = clone();
  missing.boundaries.geographyTypes.pop();
  assert.throws(() => validatePhase2RealDataOwnerDecision(missing));

  const expanded = clone();
  expanded.computePlan.proposedHardCaps.localTemporaryAndDerivedGiB = 4096;
  assert.throws(() => validatePhase2RealDataOwnerDecision(expanded));
});

test("an omitted choice or invented boundary edition fails", () => {
  const approved = clone();
  assert.equal(validatePhase2RealDataOwnerDecision(approved, { requireApproval: true }).claims.approvalRecorded, true);
  approved.ownerDecision.forestCrosswalkOption = null;
  assert.throws(() => validatePhase2RealDataOwnerDecision(approved), /crosswalk option/);

  const inventedBoundary = clone();
  Object.assign(inventedBoundary, approved, { ownerDecision: { ...approved.ownerDecision, forestCrosswalkOption: "conservative-treed-upland-v1", provinceBoundaryDecision: "invented-edition" } });
  assert.throws(() => validatePhase2RealDataOwnerDecision(inventedBoundary), /evidenced edition or defer/);
});
