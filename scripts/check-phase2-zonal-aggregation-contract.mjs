import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const contractPath = fileURLToPath(new URL("../data/phase2-zonal-aggregation-contract.json", import.meta.url));

export async function readPhase2ZonalAggregationContract() {
  return JSON.parse(await readFile(contractPath, "utf8"));
}

export function validatePhase2ZonalAggregationContract(contract) {
  assert.equal(contract.schemaVersion, "phase2-zonal-aggregation-v1");
  assert.equal(contract.algorithm, "windowed-bounded-feature-rasterization");
  assert.deepEqual(contract.requiredBindings, [
    "boundary edition and identifier field", "forest-mask and change-raster versions", "time version", "source version", "code version and worker SHA-256",
    "forest-mask, change-raster, and boundary SHA-256", "shared raster-grid CRS and reprojection evidence",
    "coverage grade", "forest-mask-derived known-forested-hectare denominator",
    "Unknown preservation when either required raster is nodata", "elapsed time, peak RSS, and maximum allocated scratch-disk bytes",
    "GDAL, Python, and NumPy environment versions",
  ]);
  assert.deepEqual(contract.claims, { admittedNationalBoundaryAggregatesExist: false, productionEligible: false });
  assert.ok(contract.prohibitions.includes("national per-cell geometry or polygon materialization"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validatePhase2ZonalAggregationContract(await readPhase2ZonalAggregationContract());
  console.log("Phase 2 zonal aggregation contract passes.");
}
