import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase5LiveWildfireExitStatus } from "../scripts/check-phase5-live-wildfire-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase5-live-wildfire-exit-status.json", import.meta.url), "utf8"));

test("Phase 5 records four exact local criteria and keeps production blockers distinct", async () => {
  assert.equal(await validatePhase5LiveWildfireExitStatus(record), record);
  assert.equal(record.completedCriteria, 4);
  assert.equal(record.percentage, 100);
  assert.equal(record.phaseComplete, false);
  assert.deepEqual(record.productionBlockers.map(({ id, status }) => [id, status]), [["cleared-feeds", "blocked"], ["operations-rehearsal", "blocked"]]);
});

test("Phase 5 rejects a premature phase completion, changed percentage, or evidence tampering", async () => {
  await assert.rejects(validatePhase5LiveWildfireExitStatus({ ...record, phaseComplete: true }), /cannot claim/);
  await assert.rejects(validatePhase5LiveWildfireExitStatus({ ...record, percentage: 75 }), /percentage/);
  const criteria = record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item);
  await assert.rejects(validatePhase5LiveWildfireExitStatus({ ...record, exitCriteria: criteria }), /checksum/);
});
