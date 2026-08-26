import assert from "node:assert/strict";
import test from "node:test";
import { readPhase2V21RasterContract, validatePhase2V21RasterContract } from "../scripts/check-phase2-v21-raster-contract.mjs";

test("the Version 2.1 raster contract pins all eleven snapshots and ten whole intervals", async () => {
  const contract = await readPhase2V21RasterContract();
  assert.equal(contract.snapshotYears.length, 11);
  assert.equal(contract.intervals.length, 10);
  assert.equal(contract.claims.outputRastersExist, false);
});

test("the contract rejects endpoint-only intervals and fabricated execution", async () => {
  const contract = structuredClone(await readPhase2V21RasterContract());
  contract.intervals[0].annualPairCount = 1;
  assert.throws(() => validatePhase2V21RasterContract(contract), /annualPairCount/);

  const fabricated = structuredClone(await readPhase2V21RasterContract());
  fabricated.claims.rasterExecutionPerformed = true;
  assert.throws(() => validatePhase2V21RasterContract(fabricated), /Expected values to be strictly deep-equal/);
});
