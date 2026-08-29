import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase7IndigenousExploreComparisonExitStatus } from "../scripts/check-phase7-indigenous-explore-comparison-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase7-indigenous-explore-comparison-exit-status.json", import.meta.url), "utf8"));

test("Phase 7 records the literal engineering and Indigenous-geometry gates without production inflation", async () => {
  assert.equal(await validatePhase7IndigenousExploreComparisonExitStatus(record), record);
  assert.equal(record.completedCriteria, 14);
  assert.equal(record.percentage, 87.5);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "fail").map((item) => item.id), ["reserve-and-treaty-layers-loaded", "right-of-reply-live"]);
  // The overlays gate was narrowed to the overlays Explore actually ships, so
  // it must not be readable as covering reserve or treaty geography. Two things
  // keep the narrowing honest and both are asserted here: the criterion's own
  // title no longer names those overlays, and the gate that does name them is
  // still failed. If that gate ever passes without real federal geometry, this
  // assertion is the one that should be revisited first.
  const overlays = record.exitCriteria.find((item) => item.id === "explore-modes-and-overlays");
  assert.doesNotMatch(overlays.title, /reserve|treaty/i);
  assert.match(overlays.reason, /tracked\s+solely by reserve-and-treaty-layers-loaded/);
  assert.equal(record.exitCriteria.find((item) => item.id === "reserve-and-treaty-layers-loaded").status, "fail");
  assert.equal(record.exitCriteria.find((item) => item.id === "mistik-request-recorded").status, "pass");
});

test("Phase 7 rejects invented completion, altered status, missing blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, phaseComplete: true }), /cannot claim/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, percentage: 100 }), /unweighted/);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, externalBlockers: record.externalBlockers.slice(0, 1) }), /two external blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase7IndigenousExploreComparisonExitStatus({ ...record, exitCriteria }), /checksum/);
});
