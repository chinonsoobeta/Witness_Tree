import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveProhibitions,
  readPhase2ZonalAggregationAmendment,
  readPhase2ZonalAggregationContract,
  validatePhase2ZonalAggregationAmendment,
  validatePhase2ZonalAggregationContract,
} from "../scripts/check-phase2-zonal-aggregation-contract.mjs";

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

test("the recorded amendment lifts the per-cell prohibition and nothing else", async () => {
  const contract = await readPhase2ZonalAggregationContract();
  const amendment = await readPhase2ZonalAggregationAmendment();
  validatePhase2ZonalAggregationAmendment(contract, amendment);
  assert.deepEqual(effectiveProhibitions(contract, amendment), [
    "converting nodata/Unknown to observed non-loss",
    "production claims using illustrative or unadmitted geometry",
  ]);
});

test("the amendment stops applying if the contract it was written against changes", async () => {
  const contract = await readPhase2ZonalAggregationContract();
  const amendment = await readPhase2ZonalAggregationAmendment();
  assert.throws(
    () => validatePhase2ZonalAggregationAmendment(contract, { ...amendment, baseSha256: "a".repeat(64) }),
    /different base contract/,
  );
});

test("the amendment cannot quietly drop what it did not authorize", async () => {
  const contract = await readPhase2ZonalAggregationContract();
  const amendment = await readPhase2ZonalAggregationAmendment();
  for (const drop of ["expert-review-100-per-province", "phase2-formal-exit-status", "nationalPerCellGeometryMaterialized"]) {
    const record = structuredClone(amendment.record);
    record.unchangedByThisAmendment = record.unchangedByThisAmendment.filter((line) => !line.includes(drop));
    assert.throws(() => validatePhase2ZonalAggregationAmendment(contract, { ...amendment, record }), new RegExp(drop));
  }
});

test("the amendment cannot lift a second prohibition by omitting it", async () => {
  const contract = await readPhase2ZonalAggregationContract();
  const amendment = await readPhase2ZonalAggregationAmendment();
  const record = structuredClone(amendment.record);
  record.retainedProhibitions = ["converting nodata/Unknown to observed non-loss"];
  assert.throws(() => validatePhase2ZonalAggregationAmendment(contract, { ...amendment, record }), /every prohibition/);
});
