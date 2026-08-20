import assert from "node:assert/strict";
import test from "node:test";

import { checkPhase1ExitEvidence, evaluatePhase1ExitEvidence } from "../scripts/check-phase1-exit-evidence.mjs";

test("authoritative Phase 1 exit audit is blocked at one of four criteria", async () => {
  const audit = await checkPhase1ExitEvidence("2026-08-20");
  assert.equal(audit.status, "blocked");
  assert.equal(audit.completedCriteria, 1);
  assert.equal(audit.totalCriteria, 4);
  assert.equal(audit.percentage, 25);
  assert.deepEqual(audit.requirements.map(({ id, complete }) => [id, complete]), [
    ["complete-source-ledger", false],
    ["reproducible-raw-archive", false],
    ["coverage-geometry", false],
    ["corruption-rejection", true],
  ]);
});

test("exit audit cannot be made complete by a false production ledger claim", async () => {
  const baseline = {
    ledger: { status: "production", entries: [] },
    candidates: { entries: [] },
    staged: { entries: [{ sha256: "a".repeat(64), immutableObjectStorage: true }] },
    coverageGeometry: { id: "coverage-geometry", complete: false, evidenceRefs: [], observed: {}, reason: "blocked" },
    corruptionGate: { status: "passed", probes: [{ rejected: false }] },
  };
  const recomputed = evaluatePhase1ExitEvidence({ ...baseline, asOf: "2026-08-20" });
  assert.equal(recomputed.status, "blocked");
  assert.equal(recomputed.percentage, 0);
});
