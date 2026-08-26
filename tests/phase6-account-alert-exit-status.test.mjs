import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase6AccountAlertExitStatus } from "../scripts/check-phase6-account-alert-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase6-account-alert-exit-status.json", import.meta.url), "utf8"));

test("Phase 6 records exactly the five plan exit criteria and its honest local result", async () => {
  assert.equal(await validatePhase6AccountAlertExitStatus(record), record);
  assert.equal(record.completedCriteria, 3);
  assert.equal(record.percentage, 60);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.exitCriteria.filter((item) => item.status === "fail").map((item) => item.id), ["direct-database-tenant-isolation", "kill-switch-under-five-minutes"]);
});

test("Phase 6 rejects an invented completion, altered percentage, missing blocker, or tampered evidence", async () => {
  await assert.rejects(validatePhase6AccountAlertExitStatus({ ...record, phaseComplete: true }), /cannot claim/);
  await assert.rejects(validatePhase6AccountAlertExitStatus({ ...record, percentage: 80 }), /unweighted/);
  await assert.rejects(validatePhase6AccountAlertExitStatus({ ...record, activationBlockers: record.activationBlockers.slice(0, 2) }), /three activation blockers/);
  const exitCriteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase6AccountAlertExitStatus({ ...record, exitCriteria }), /checksum/);
});
