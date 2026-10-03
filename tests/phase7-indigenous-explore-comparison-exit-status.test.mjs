import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase7IndigenousExploreComparisonExitStatus } from "../scripts/check-phase7-indigenous-explore-comparison-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase7-indigenous-explore-comparison-exit-status.json", import.meta.url), "utf8"));

test("Phase 7 is 12/14 after the owner removed the Engagement and Decisions pages, without production inflation", async () => {
  assert.equal(await validatePhase7IndigenousExploreComparisonExitStatus(record), record);
  assert.equal(record.completedCriteria, 12);
  assert.equal(record.totalCriteria, 14);
  assert.equal(record.phaseComplete, false);
  assert.equal(record.localImplementationStatus, "incomplete");
  // The register and the published Mistik outcome left with those pages on
  // 2026-10-03; neither gate may stay passed on a surface that is gone.
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "fail").map((item) => item.id), ["engagement-register-published", "mistik-request-recorded"]);
  assert.deepEqual(record.removedCriteria, [
    { id: "reserve-and-treaty-layers-loaded", decision: "data/phase-scope-decision-2026-09-26.json" },
    { id: "right-of-reply-live", decision: "data/phase-scope-decision-2026-09-26.json" },
  ]);
  assert.deepEqual(record.externalBlockers, []);
  // Removal publishes nothing: the boundary still says no Indigenous geography ships.
  assert.match(record.nonProductionBoundary, /No official reserve or treaty geometry/);
  // The overlays gate was narrowed to the overlays Explore actually ships, so
  // it must not be readable as covering reserve or treaty geography. Two things
  // keep that honest and both are asserted here: the criterion's own title does
  // not name those overlays, and the gate that named them was removed by the
  // owner's 2026-09-26 decision not to publish that geography, not passed.
  const overlays = record.exitCriteria.find((item) => item.id === "explore-modes-and-overlays");
  assert.doesNotMatch(overlays.title, /reserve|treaty/i);
  assert.match(overlays.reason, /will not publish reserve or treaty geography/);
  assert.equal(record.exitCriteria.find((item) => item.id === "reserve-and-treaty-layers-loaded"), undefined);
  assert.match(record.exitCriteria.find((item) => item.id === "mistik-request-recorded").reason, /remains recorded, unchanged, in data\/phase0-owner-scope-decisions-2026-08-27\.json/);
});

test("Phase 7 rejects invented completion, altered status, missing blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, phaseComplete: true }), /derived/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, percentage: 100 }), /unweighted/);
  // A gate on a removed page cannot be flipped back to passing by the count alone.
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, completedCriteria: 14, percentage: 100, phaseComplete: true, localImplementationStatus: "complete" }), /unweighted/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, externalBlockers: [{ id: "owner-managed-right-of-reply-route", status: "blocked", reason: "A blocker for a gate that no longer exists." }] }), /one external blocker per failing gate/);
  // The removal needs the owner's decision: without it, all sixteen criteria are required again.
  const decision = JSON.parse(readFileSync(new URL("../data/phase-scope-decision-2026-09-26.json", import.meta.url), "utf8"));
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus(record, { ...decision, removedCriteria: decision.removedCriteria.filter((item) => item.phase !== 7) }), /less those the scope decision removes/);
  // And the decision cannot remove a criterion Phase 7 does not list as removable.
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus(record, { ...decision, removedCriteria: [...decision.removedCriteria, { phase: 7, criterion: "no-indigenous-ranking", reason: "An attempt to remove a criterion this phase does not allow." }] }), /does not allow no-indigenous-ranking/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, exitCriteria }), /checksum/);
});
