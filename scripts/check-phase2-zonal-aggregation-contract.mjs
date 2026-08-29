import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const contractPath = fileURLToPath(new URL("../data/phase2-zonal-aggregation-contract.json", import.meta.url));
const amendmentPath = fileURLToPath(new URL("../data/phase2-zonal-aggregation-contract-amendment-2026-08-29.json", import.meta.url));

export async function readPhase2ZonalAggregationContract() {
  return JSON.parse(await readFile(contractPath, "utf8"));
}

export async function readPhase2ZonalAggregationAmendment() {
  const raw = await readFile(amendmentPath, "utf8");
  return { record: JSON.parse(raw), baseSha256: createHash("sha256").update(await readFile(contractPath)).digest("hex") };
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
  // The contract keeps all three prohibitions verbatim. An owner-approved
  // admission record binds this file through the admission packet, so it is
  // never edited in place; a later amendment is recorded as its own file and
  // read on top of it by validatePhase2ZonalAggregationAmendment.
  assert.ok(contract.prohibitions.includes("national per-cell geometry or polygon materialization"));
  assert.ok(contract.prohibitions.includes("converting nodata/Unknown to observed non-loss"));
  assert.ok(contract.prohibitions.includes("production claims using illustrative or unadmitted geometry"));
}

/**
 * The per-cell prohibition was lifted by a recorded owner amendment on
 * 2026-08-29. The amendment only holds while it is bound to the exact base
 * contract it was written against, while it still names who authorized it and
 * bounds its own scope, and while it keeps saying what it did not authorize,
 * so that a later reader cannot mistake an authorization for a gate having
 * been met. The other two prohibitions still bind the new product.
 */
export function validatePhase2ZonalAggregationAmendment(contract, { record, baseSha256 }) {
  assert.equal(record.schemaVersion, "witness-tree/phase2-zonal-aggregation-contract-amendment/1");
  assert.equal(record.status, "recorded-amendment");
  assert.equal(record.base.path, "data/phase2-zonal-aggregation-contract.json");
  assert.equal(record.base.sha256, baseSha256, "the amendment is bound to a different base contract than the one on disk");
  assert.equal(record.amends, "prohibitions");
  assert.equal(record.removedProhibition, "national per-cell geometry or polygon materialization");
  assert.equal(record.authorizedBy, "owner");
  assert.equal(record.authorizedOn, "2026-08-29");
  assert.ok(record.scope?.includes("1984-1985"), "the amendment must bound its own scope");
  for (const retained of record.retainedProhibitions) {
    assert.ok(contract.prohibitions.includes(retained), `${retained} is not a prohibition in the base contract`);
  }
  assert.deepEqual(
    contract.prohibitions.filter((entry) => entry !== record.removedProhibition).sort(),
    record.retainedProhibitions.slice().sort(),
    "the amendment must account for every prohibition the base contract carries",
  );
  for (const required of ["expert-review-100-per-province", "phase2-formal-exit-status", "nationalPerCellGeometryMaterialized"]) {
    assert.ok(record.unchangedByThisAmendment?.some((line) => line.includes(required)), `the amendment must record that ${required} is unchanged`);
  }
}

/** The prohibitions that bind work done after the recorded amendments. */
export function effectiveProhibitions(contract, { record }) {
  return contract.prohibitions.filter((entry) => entry !== record.removedProhibition);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contract = await readPhase2ZonalAggregationContract();
  validatePhase2ZonalAggregationContract(contract);
  validatePhase2ZonalAggregationAmendment(contract, await readPhase2ZonalAggregationAmendment());
  console.log("Phase 2 zonal aggregation contract passes.");
}
