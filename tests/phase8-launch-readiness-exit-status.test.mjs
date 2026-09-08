import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase8LaunchReadinessExitStatus } from "../scripts/check-phase8-launch-readiness-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase8-launch-readiness-exit-status.json", import.meta.url), "utf8"));

test("Phase 8 records every literal launch-readiness gate without production inflation", async () => {
  assert.equal(await validatePhase8LaunchReadinessExitStatus(record), record);
  /*
   * Seven. CDN and tile validation passes only on the strength of a browser
   * observation of the deployed Site bound to the client it observed. The
   * 2026-09-05 run observed main's client; merging main into the
   * confidence-first redesign changed both the map style and the client again,
   * so that observation no longer describes what the Site would serve and the
   * criterion is failing rather than waived. Nothing weaker is holding it up:
   * the preview and break-glass tiers exist and neither record is committed
   * here. A redeploy of this branch followed by a successful harness run
   * against the deployed Site is what restores it, and this count moves back to
   * eight when that happens rather than because the code exists. It stays a
   * delivery-and-rendering gate: it asserts no production admission.
   */
  assert.equal(record.completedCriteria, 7);
  assert.equal(record.totalCriteria, 16);
  assert.equal(record.percentage, 43.75);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "pass").map((item) => item.id), ["raw-archive-reproducibility", "governance-and-corrections-procedures", "operations-handbook", "bulk-downloads", "citation-format", "release-notes", "restore-tests"]);

  // The criterion tracks the gate rather than the code: whenever
  // check:deployed-map-render is red, cdn-tile-validation must not read as pass.
  const { resolveDeployedMapRender } = await import("../scripts/check-deployed-map-render.mjs");
  const gate = resolveDeployedMapRender();
  const cdn = record.exitCriteria.find((item) => item.id === "cdn-tile-validation");
  assert.equal(cdn.status, gate.failures.length === 0 ? "pass" : "fail", `cdn-tile-validation says ${cdn.status} while the gate reports ${gate.failures.length} failure(s)`);
});

test("Phase 8 rejects invented readiness, altered gates, blockers, and tampered evidence", async () => {
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, phaseComplete: true }), /completion flags/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, percentage: 100 }), /unweighted/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, exitCriteria: record.exitCriteria.slice(1) }), /sixteen literal/);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, externalBlockers: record.externalBlockers.slice(1) }), /six external blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase8LaunchReadinessExitStatus({ ...record, exitCriteria }), /checksum/);
});
