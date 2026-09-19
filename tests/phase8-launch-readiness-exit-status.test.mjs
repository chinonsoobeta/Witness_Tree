import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase8LaunchReadinessExitStatus } from "../scripts/check-phase8-launch-readiness-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase8-launch-readiness-exit-status.json", import.meta.url), "utf8"));

test("Phase 8 records every literal launch-readiness gate without production inflation", async () => {
  assert.equal(await validatePhase8LaunchReadinessExitStatus(record), record);
  /*
   * Seven. CDN and tile validation passes only on the strength of a browser
   * observation of the deployed Site bound to the client it observed, so it
   * moves in both directions as the client changes and is redeployed. It last
   * read pass on the 2026-09-12 observation. On 2026-09-19 this branch changed
   * lib/explore/map-style.ts and components/explore/ExploreMapClient.tsx to
   * draw patches from one span archive filtered on the year each patch was
   * lost, so that observation stopped describing the client the Site would
   * serve and the criterion returned to fail, as it did on 2026-09-01, 09-02,
   * 09-04 and 09-08. The count moves down because a measurement went stale,
   * not because anything was withdrawn: nothing weaker stands in for it, no
   * preview observation and no break-glass record is committed here, and the
   * earlier observations stay on disk as true accounts of their own days.
   * Restoring it takes a redeploy of the Site from this branch followed by a
   * passing run of the harness against it. It stays a delivery-and-rendering
   * gate: it asserts no production admission, and the other fifteen criteria
   * are untouched by this change.
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
