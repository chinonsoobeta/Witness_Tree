import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase8LaunchReadinessExitStatus } from "../scripts/check-phase8-launch-readiness-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase8-launch-readiness-exit-status.json", import.meta.url), "utf8"));

test("Phase 8 records every literal launch-readiness gate without production inflation", async () => {
  assert.equal(await validatePhase8LaunchReadinessExitStatus(record), record);
  /*
   * Eight. CDN and tile validation passes only on the strength of a browser
   * observation of the deployed Site bound to the client it observed, so it
   * moves in both directions as the client changes and is redeployed. It has
   * failed on 2026-09-01, 09-02, 09-04, 09-08 and 09-19, and twice on 09-20:
   * once on accepted debt, and once here, when this branch took the Explore
   * map chrome out of the map frame and left the version 34 observation
   * describing a client the Site no longer served. Sites version 36 deployed
   * that client and the harness observed it, so this reads eight again. On
   * 2026-09-21 this branch moved both map files, so the count is seven until
   * the owner redeploys this branch and the harness observes it.
   *
   * The count is the thing to watch, and the thing not to read. It was eight
   * while the criterion rested on a measurement, eight again while it rested
   * on an owner-authorized break-glass that stated outright that nothing had
   * been measured, and seven while it rested on nothing at all. A number that
   * did not move when the criterion stopped being evidenced cannot be trusted
   * to mean that it is, so read the criterion's own reason rather than the
   * count. The assertion below this one is the real guard: it ties the
   * criterion's status to the live gate, so neither can drift from the other.
   *
   * The gate stays a delivery-and-rendering gate either way: it asserts no
   * production admission, and the other fifteen criteria are untouched.
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
