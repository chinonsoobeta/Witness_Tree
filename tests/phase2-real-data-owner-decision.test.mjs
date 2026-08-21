import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePhase2RealDataOwnerDecision } from "../scripts/check-phase2-real-data-owner-decision.mjs";

const fixture = JSON.parse(await readFile(new URL("../data/phase2-real-data-owner-decision.json", import.meta.url), "utf8"));
const clone = () => structuredClone(fixture);

test("pending Phase 2 decision package is complete but does not authorize processing", () => {
  assert.equal(validatePhase2RealDataOwnerDecision(clone()).ownerDecision.status, "pending");
  assert.throws(() => validatePhase2RealDataOwnerDecision(clone(), { requireApproval: true }), /has not been recorded/);
});

test("approval cannot be inferred from a status or claim flip", () => {
  const statusOnly = clone();
  statusOnly.ownerDecision.status = "approved-for-versioned-nonproduction-processing";
  assert.throws(() => validatePhase2RealDataOwnerDecision(statusOnly), /owner-decision-recorded/);

  const claimOnly = clone();
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

test("a fully explicit synthetic approval shape passes while an omitted choice fails", () => {
  const approved = clone();
  approved.status = "owner-decision-recorded";
  approved.claims.approvalRecorded = true;
  approved.ownerDecision = {
    status: "approved-for-versioned-nonproduction-processing",
    ownerName: "Test owner",
    recordedAt: "2026-08-21T12:00:00Z",
    forestCrosswalkOption: "conservative-treed-upland-v1",
    approveExactHarvestScope: true,
    approveExactWildfireScope: true,
    approveComputeCaps: true,
    approveNationalMaskAndChangeNonProductionRun: true,
    provinceBoundaryDecision: "defer",
    municipalityBoundaryDecision: "defer",
    federalRidingBoundaryDecision: "defer",
    acknowledgeAllEightAggregatesRemainBlocked: true,
    acknowledgeNonProductionOutputs: true,
    acknowledgeNoExternalActionOrRelease: true,
  };
  assert.equal(validatePhase2RealDataOwnerDecision(approved, { requireApproval: true }).claims.approvalRecorded, true);
  approved.ownerDecision.forestCrosswalkOption = null;
  assert.throws(() => validatePhase2RealDataOwnerDecision(approved), /crosswalk option/);

  const inventedBoundary = clone();
  Object.assign(inventedBoundary, approved, { ownerDecision: { ...approved.ownerDecision, forestCrosswalkOption: "conservative-treed-upland-v1", provinceBoundaryDecision: "invented-edition" } });
  assert.throws(() => validatePhase2RealDataOwnerDecision(inventedBoundary), /evidenced edition or defer/);
});
