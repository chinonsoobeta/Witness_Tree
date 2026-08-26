import assert from "node:assert/strict";
import test from "node:test";
import { readPhase2ZonalAggregationContract, validatePhase2ZonalAggregationContract } from "../scripts/check-phase2-zonal-aggregation-contract.mjs";

test("the zonal aggregation contract stays raster-first and explicitly non-production", async () => {
  const contract = await readPhase2ZonalAggregationContract();
  validatePhase2ZonalAggregationContract(contract);
  assert.equal(contract.claims.admittedNationalBoundaryAggregatesExist, false);
});

test("the contract rejects a fabricated admitted aggregate claim", async () => {
  const contract = structuredClone(await readPhase2ZonalAggregationContract());
  contract.claims.productionEligible = true;
  assert.throws(() => validatePhase2ZonalAggregationContract(contract));
});
