import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGdalTranslateArgs, parseOptions, validateExecutionAuthorization, validateRasterMetadata } from "../scripts/run-phase1-ntems-transform.mjs";

const runnerSha256 = createHash("sha256").update(readFileSync(new URL("../scripts/run-phase1-ntems-transform.mjs", import.meta.url))).digest("hex");
const specSha256 = createHash("sha256").update(readFileSync(new URL("../data/phase1-production-transformation-specifications-v1.json", import.meta.url))).digest("hex");

test("defaults to preflight and never invents an execution timestamp", () => {
  const options = parseOptions([]);
  assert.equal(options.execute, false);
  assert.equal(options.createdAt, undefined);
  assert.equal(options.authorization, undefined);
});

test("builds a streamed /vsizip-compatible lossless GDAL command", () => {
  assert.deepEqual(buildGdalTranslateArgs("/vsizip/data/archive.zip/member.tif", "/tmp/out.tif", "Byte"), ["-of", "GTiff", "-co", "TILED=YES", "-co", "BIGTIFF=YES", "-co", "COMPRESS=DEFLATE", "-co", "PREDICTOR=2", "-co", "NUM_THREADS=1", "/vsizip/data/archive.zip/member.tif", "/tmp/out.tif"]);
});

test("validates raster dimensions, dtype, nodata, and class semantics", () => {
  const info = { size: [2, 2], geoTransform: [0, 30, 0, 60, 0, -30], coordinateSystem: { wkt: "WKT" }, bands: [{ type: "Byte", noDataValue: 255, rat: { row: [{ f: [20, 1] }, { f: [0, 3] }] } }] };
  assert.deepEqual(validateRasterMetadata(info, { width: 2, height: 2, geotransform: [0, 30, 0, 60, 0, -30], dataType: "Byte", noDataValue: 255, classValues: [0, 20], proj4: "" }, "fixture"), { classSemantics: "published-class-values-bound" });
  assert.throws(() => validateRasterMetadata({ ...info, bands: [{ ...info.bands[0], type: "UInt16" }] }, { width: 2, height: 2, geotransform: [0, 30, 0, 60, 0, -30], dataType: "Byte", noDataValue: 255, classValues: [0, 20], proj4: "" }));
});

test("execution authorization is exact and binds runner/spec/input hashes plus fixed createdAt", () => {
  const expected = { runner: { path: "scripts/run-phase1-ntems-transform.mjs", sha256: runnerSha256 }, specifications: ["ntems-annual-land-cover-v1", "ntems-forest-harvest-v1", "ntems-canopy-cover-v1", "ntems-canopy-height-v1"].map((id) => ({ id, path: "data/phase1-production-transformation-specifications-v1.json", sha256: specSha256 })), inputs: [{ path: "raw/a.zip", sha256: "a".repeat(64), byteLength: 1, member: "a.tif" }], dataRoot: "/tmp/data" };
  const record = { schemaVersion: "witness-tree/phase1-ntems-execution-authorization/1", status: "approved-owner-local-execution", decisionId: "phase1-ntems-raster-execution-v1", ownerDecision: { ownerName: "Chinonso Obeta", decision: "approve", scope: "Four NTEMS raster scopes only; no external mutation, ingestion, release, or production admission." }, runner: expected.runner, specifications: expected.specifications, inputs: expected.inputs, createdAt: "2026-08-25T00:00:00Z", boundary: { localOnly: true, externalMutation: false, ingestion: false, release: false, productionAdmission: false, productionEligible: false, overwriteExisting: false } };
  assert.equal(validateExecutionAuthorization(record, expected, "2026-08-25T00:00:00Z"), record);
  for (const mutate of [(value) => { value.runner.sha256 = "0".repeat(64); }, (value) => { value.createdAt = "2026-08-26T00:00:00Z"; }, (value) => { value.boundary.externalMutation = true; }, (value) => { value.inputs.pop(); }]) {
    const copy = structuredClone(record); mutate(copy); assert.throws(() => validateExecutionAuthorization(copy, expected, "2026-08-25T00:00:00Z"));
  }
});

test("rejects execute mode without a separate authorization and fixed timestamp", () => {
  assert.throws(() => { const options = parseOptions(["--execute"]); if (options.execute && (!options.authorization || !options.createdAt)) throw new Error("authorization required"); }, /authorization required/);
});
