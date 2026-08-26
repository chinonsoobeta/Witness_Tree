import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase9PublicBetaLaunchExitStatus } from "../scripts/check-phase9-public-beta-launch-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase9-public-beta-launch-exit-status.json", import.meta.url), "utf8"));

test("Phase 9 records every literal beta-and-launch gate without launch inflation", async () => {
  assert.equal(await validatePhase9PublicBetaLaunchExitStatus(record), record);
  assert.equal(record.completedCriteria, 0);
  assert.equal(record.totalCriteria, 4);
  assert.equal(record.percentage, 0);
  assert.equal(record.phaseComplete, false);
});

test("Phase 9 rejects invented completion, altered gates, blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase9PublicBetaLaunchExitStatus({ ...record, phaseComplete: true }), /completion flags/);
  await assert.rejects(validatePhase9PublicBetaLaunchExitStatus({ ...record, percentage: 100 }), /unweighted/);
  await assert.rejects(validatePhase9PublicBetaLaunchExitStatus({ ...record, exitCriteria: record.exitCriteria.slice(1) }), /four literal/);
  await assert.rejects(validatePhase9PublicBetaLaunchExitStatus({ ...record, externalBlockers: record.externalBlockers.slice(1) }), /four external blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase9PublicBetaLaunchExitStatus({ ...record, exitCriteria }), /checksum/);
});
