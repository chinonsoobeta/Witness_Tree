import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase7IndigenousExploreComparisonExitStatus } from "../scripts/check-phase7-indigenous-explore-comparison-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase7-indigenous-explore-comparison-exit-status.json", import.meta.url), "utf8"));

test("Phase 7 records the literal engineering and Indigenous-geometry gates without production inflation", async () => {
  assert.equal(await validatePhase7IndigenousExploreComparisonExitStatus(record), record);
  assert.equal(record.completedCriteria, 13);
  assert.equal(record.percentage, 81.25);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "fail").map((item) => item.id), ["reserve-and-treaty-layers-loaded", "right-of-reply-live", "explore-modes-and-overlays"]);
  // The overlays gate was deliberately regressed rather than quietly rescoped:
  // the reserve and treaty-area overlays were removed from Explore because
  // their sources are authority blocked, so the criterion as written no longer
  // holds even though the riding overlays became real drawn layers.
  assert.match(record.exitCriteria.find((item) => item.id === "explore-modes-and-overlays").reason, /reserve and treaty-area overlays were removed/);
  assert.equal(record.exitCriteria.find((item) => item.id === "mistik-request-recorded").status, "pass");
});

test("Phase 7 rejects invented completion, altered status, missing blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, phaseComplete: true }), /cannot claim/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, percentage: 100 }), /unweighted/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, externalBlockers: record.externalBlockers.slice(0, 1) }), /two external blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, exitCriteria }), /checksum/);
});
