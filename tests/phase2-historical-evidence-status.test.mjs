import assert from "node:assert/strict";
import test from "node:test";
import { readPhase2HistoricalEvidenceStatus, validatePhase2HistoricalEvidenceStatus } from "../scripts/check-phase2-historical-evidence-status.mjs";

test("historical Phase 2 evidence stays outside Version 2.1 completion and admission", async () => {
  const status = await readPhase2HistoricalEvidenceStatus();
  assert.equal(status.status, "historical-versioned-nonproduction");
  assert.equal(status.v21Separation.historicalEvidenceMaySatisfyV21OutputGate, false);
  assert.equal(status.v21Separation.historicalEvidenceMaySatisfyAdmissionGate, false);
});

test("the adapter rejects a historical-evidence promotion claim", async () => {
  const status = structuredClone(await readPhase2HistoricalEvidenceStatus());
  status.v21Separation.v21OutputRastersExist = true;
  assert.throws(() => validatePhase2HistoricalEvidenceStatus(status));
});
