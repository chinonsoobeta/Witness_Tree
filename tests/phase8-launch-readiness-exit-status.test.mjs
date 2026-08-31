import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase8LaunchReadinessExitStatus } from "../scripts/check-phase8-launch-readiness-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase8-launch-readiness-exit-status.json", import.meta.url), "utf8"));

test("Phase 8 records every literal launch-readiness gate without production inflation", async () => {
  assert.equal(await validatePhase8LaunchReadinessExitStatus(record), record);
  assert.equal(record.completedCriteria, 8);
  assert.equal(record.totalCriteria, 16);
  assert.equal(record.percentage, 50);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "pass").map((item) => item.id), ["raw-archive-reproducibility", "governance-and-corrections-procedures", "operations-handbook", "bulk-downloads", "citation-format", "release-notes", "restore-tests", "cdn-tile-validation"]);
});

test("Phase 8 rejects invented readiness, altered gates, blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, phaseComplete: true }), /completion flags/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, percentage: 100 }), /unweighted/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, exitCriteria: record.exitCriteria.slice(1) }), /sixteen literal/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, externalBlockers: record.externalBlockers.slice(1) }), /six external blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, exitCriteria }), /checksum/);
});
