import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { rejectStagingFiles, validateEvidenceRecord, validateRasterStructure, validateSidecarRecord, verify } from "../scripts/verify-phase1-ntems-transform.mjs";

const contract = { width: 2, height: 2, geotransform: [0, 30, 0, 60, 0, -30], proj4: "+proj=lcc", dataType: "UInt16", noDataValue: 65536, classValues: [0, 1985] };
const info = { size: [2, 2], geoTransform: [0, 30, 0, 60, 0, -30], coordinateSystem: { wkt: "WKT" }, bands: [{ type: "UInt16", noDataValue: 65536, rat: { row: [{ f: [1985, 1] }, { f: [0, 3] }] } }] };

test("independent raster verifier rejects structural metadata drift", () => {
  assert.equal(validateRasterStructure(info, contract, "fixture", { proj4: "+proj=lcc" }), true);
  assert.throws(() => validateRasterStructure({ ...info, size: [3, 2] }, contract, "fixture", { proj4: "+proj=lcc" }));
  assert.throws(() => validateRasterStructure({ ...info, bands: [{ ...info.bands[0], type: "Byte" }] }, contract, "fixture", { proj4: "+proj=lcc" }));
  assert.throws(() => validateRasterStructure({ ...info, bands: [{ ...info.bands[0], rat: { row: [{ f: [0, 4] }] } }] }, contract, "fixture", { proj4: "+proj=lcc" }));
  const missingClassTable = { ...info, bands: [{ ...info.bands[0], rat: undefined }] };
  assert.throws(() => validateRasterStructure(missingClassTable, contract, "fixture", { proj4: "+proj=lcc" }));
  assert.equal(validateRasterStructure(missingClassTable, contract, "known-defect", { proj4: "+proj=lcc", allowMissingClassTable: true }), true);
});

test("independent sidecar verifier rejects output, checksum, claims, command, and byte determinism drift", () => {
  const context = { specification: { id: "ntems-forest-harvest-v1", methodVersion: "phase1-ntems-forest-harvest-v1" }, inputBinding: { path: "raw/a.zip", sha256: "a".repeat(64), byteLength: 1, member: "a.tif", classSemantics: "published-class-values-bound" }, toolVersions: { gdalTranslate: "GDAL", gdalInfo: "GDAL", gdalsrsinfo: "GDAL" }, createdAt: "2026-08-26T00:55:28Z", outputByteLength: 10, outputSha256: "b".repeat(64), sourceQa: { classSemantics: "published-class-values-bound" }, sourcePixelChecksum: 7, outputPixelChecksum: 7 };
  const expected = { relativeOutput: "ntems-forest-harvest-v1/hash/method/forest-harvest-year-1985-2022.tif", command: ["-of", "GTiff"] };
  const sidecar = { schemaVersion: "witness-tree/phase1-ntems-transformation-sidecar/1", specId: context.specification.id, methodVersion: context.specification.methodVersion, inputBindings: [context.inputBinding], command: expected.command, toolVersions: context.toolVersions, output: { path: expected.relativeOutput, format: "GTiff" }, outputSha256: "b".repeat(64), outputByteLength: 10, createdAt: context.createdAt, qa: { source: context.sourceQa, outputMetadataChecked: true, outputChecksumChecked: true, noResamplingOrReprojection: true, noOverwrite: true, sourcePixelChecksum: 7, outputPixelChecksum: 7 }, claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false } };
  assert.equal(validateSidecarRecord(sidecar, expected, context), sidecar);
  for (const mutate of [(value) => { value.outputSha256 = "c".repeat(64); }, (value) => { value.claims.productionEligible = true; }, (value) => { value.command = ["evil"]; }, (value) => { value.createdAt = "2026-08-27T00:00:00Z"; }, (value) => { value.inputBindings[0].sha256 = "d".repeat(64); }]) {
    const copy = structuredClone(sidecar); mutate(copy); assert.throws(() => validateSidecarRecord(copy, expected, context));
  }
});

test("checksum-bound evidence rejects count, hash, and claim tampering", () => {
  const evidence = {
    schemaVersion: "witness-tree/phase1-ntems-transformation-readback-evidence/1",
    status: "complete-readback-verified",
    authorization: { path: "data/phase1-ntems-forest-harvest-execution-authorization.json", sha256: "a".repeat(64), createdAt: "2026-08-26T00:55:28Z" },
    runner: { path: "scripts/run-phase1-ntems-transform.mjs", sha256: "b".repeat(64) },
    specifications: [{ id: "ntems-forest-harvest-v1", path: "data/phase1-production-transformation-specifications-v1.json", sha256: "c".repeat(64) }],
    outputs: [{ specification: "ntems-forest-harvest-v1", input: "raw/harvest.zip", status: "verified", output: "ntems-forest-harvest-v1/hash/method/forest-harvest-year-1985-2022.tif", outputSha256: "d".repeat(64), outputByteLength: 10, sidecarSha256: "e".repeat(64), sourcePixelChecksum: 7, outputPixelChecksum: 7 }],
    counts: { expected: 1, verified: 1, missing: 0 },
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
    sourceRecord: { path: "data/phase1-production-transformation-specifications-v1.json", sha256: "f".repeat(64) },
  };
  assert.equal(validateEvidenceRecord(evidence), true);
  for (const mutate of [
    (value) => { value.counts.verified = 0; },
    (value) => { value.outputs[0].outputSha256 = "z".repeat(64); },
    (value) => { value.claims.productionAdmission = true; },
    (value) => { value.sourceRecord.sha256 = "z".repeat(64); },
  ]) {
    const copy = structuredClone(evidence);
    mutate(copy);
    assert.throws(() => validateEvidenceRecord(copy));
  }
});

test("readback fails closed when a runner staging file would permit an unsafe overwrite", () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "ntems-readback-"));
  try {
    const output = path.join(temporaryRoot, "forest-harvest-year-1985-2022.tif");
    const sidecar = `${output}.sidecar.json`;
    writeFileSync(`${output}.tmp-123`, "unfinished");
    assert.throws(() => rejectStagingFiles({ output, sidecar, relativeOutput: "forest-harvest-year-1985-2022.tif" }));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

/**
 * The destination used to default to a filename with 2026-08-26 frozen into it,
 * so a run on any later day wrote its readback under a name asserting a date it
 * did not happen on. All four specs now also have 2026-08-30 records, so the
 * default named a real file from a different run. Only the wx write flag kept
 * that from overwriting the original, and a deleted or moved file would have
 * removed even that.
 *
 * The refusal is at the top of verify(), before the data root is touched, so
 * this runs in CI and a bad invocation costs nothing instead of costing a full
 * re-read of every derived raster.
 */
test("writing readback evidence refuses a defaulted destination, before any work is done", () => {
  assert.throws(
    () => verify({ writeEvidence: true, specId: "ntems-canopy-cover-v1" }),
    /--write-evidence requires an explicit --evidence-path/,
    "A defaulted filename can name a date the run did not happen on.",
  );
  assert.throws(
    () => verify({ writeEvidence: true, evidencePath: "data/some-readback-evidence.json" }),
    /provide --authorization/,
    "With a destination named, the run proceeds past this check to its real work.",
  );
  assert.doesNotThrow(() => verify.length, "The refusal must not depend on the data root being mounted.");
});
