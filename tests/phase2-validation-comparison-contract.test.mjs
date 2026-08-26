import assert from "node:assert/strict";
import test from "node:test";
import { readPhase2ValidationComparisonContract, validatePhase2ValidationComparisonContract } from "../scripts/check-phase2-validation-comparison-contract.mjs";

test("the Phase 2 validation framework has reproducible synthetic selection evidence and no results", async () => {
  const record = await readPhase2ValidationComparisonContract();
  assert.equal(record.samplePlan.locationsPerProvince, 100);
  assert.equal(record.samplePlan.expertReview.status, "not-started");
  assert.equal(record.claims.validationResultsExist, false);
});

test("the contract rejects a hidden comparison or a fabricated validation result", async () => {
  const record = structuredClone(await readPhase2ValidationComparisonContract());
  record.harvestComparisons[0].publication = "hidden";
  assert.throws(() => validatePhase2ValidationComparisonContract(record), /Expected values to be strictly equal/);
  const fabricated = structuredClone(await readPhase2ValidationComparisonContract());
  fabricated.claims.validationResultsExist = true;
  assert.throws(() => validatePhase2ValidationComparisonContract(fabricated), /Expected values to be strictly equal/);
});
