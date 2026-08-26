import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT_URL = new URL("../data/phase2-v21-raster-contract.json", import.meta.url);
export const SNAPSHOT_YEARS = Object.freeze([1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022]);

export function validatePhase2V21RasterContract(contract) {
  assert.equal(contract.schemaVersion, "witness-tree/phase2-v21-raster-contract/1");
  assert.equal(contract.status, "local-contract-ready-no-output-raster");
  assert.deepEqual(contract.snapshotYears, SNAPSHOT_YEARS);
  assert.equal(contract.gridRequirement?.gridId, "vlce2-lcc-nad83");
  assert.equal(contract.gridRequirement?.mustMatchExactly, true);
  assert.equal(contract.gridRequirement?.rasterReprojection, "forbidden");
  assert.equal(contract.gridRequirement?.nodataValue, 255);
  assert.equal(contract.intervals?.length, SNAPSHOT_YEARS.length - 1);
  contract.intervals.forEach((interval, index) => {
    assert.deepEqual(interval, {
      fromYear: SNAPSHOT_YEARS[index],
      toYear: SNAPSHOT_YEARS[index + 1],
      annualPairCount: SNAPSHOT_YEARS[index + 1] - SNAPSHOT_YEARS[index],
    });
  });
  assert.match(contract.semantics?.intervalValueOne ?? "", /at least one adjacent annual loss raster.*full interval/i);
  assert.match(contract.semantics?.intervalValueZero ?? "", /Every adjacent annual loss raster explicitly records no loss/i);
  assert.match(contract.semantics?.intervalNoData ?? "", /never convert missing coverage to zero/i);
  assert.equal(Array.isArray(contract.requiredBeforeOutput), true);
  assert.equal(contract.requiredBeforeOutput.length, 3);
  assert.equal(contract.outputs?.length, 0, "This contract must not invent outputs before admitted execution.");
  assert.deepEqual(contract.claims, {
    inputAdmissionComplete: false,
    rasterExecutionPerformed: false,
    outputRastersExist: false,
    boundaryAggregationPerformed: false,
    released: false,
    productionEligible: false,
    externalAction: false,
  });
  return contract;
}

export async function readPhase2V21RasterContract() {
  return validatePhase2V21RasterContract(JSON.parse(await readFile(CONTRACT_URL, "utf8")));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const contract = await readPhase2V21RasterContract();
  console.log(JSON.stringify({ status: contract.status, snapshots: contract.snapshotYears.length, intervals: contract.intervals.length, productionEligible: false }));
}
