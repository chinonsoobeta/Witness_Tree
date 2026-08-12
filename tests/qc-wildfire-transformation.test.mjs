import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const spec = JSON.parse(await readFile(new URL("data/transformation-specs/qc-historic-wildfire-v1.json", root), "utf8"));
const run = JSON.parse(await readFile(new URL("data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json", root), "utf8"));
const script = await readFile(new URL("scripts/transform-quebec-wildfire.py", root), "utf8");

test("Québec wildfire spec requires a lossless, non-production transformation", () => {
  assert.equal(spec.sourceId, "qc-historic-wildfire-detailed");
  assert.match(spec.rawArchiveSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(spec.fieldNormalizations, []);
  assert.equal(spec.geometryOperation, "none");
  assert.deepEqual(spec.semanticChanges, []);
  assert.deepEqual(spec.requiredValidation, {
    sourceAndOutputFeatureCountsMustMatch: true,
    sourceAndOutputFieldsMustMatch: true,
    sourceAndOutputContentFingerprintMustMatch: true,
    outputMissingGeometryCount: 0,
    outputEmptyGeometryCount: 0,
    outputInvalidGeometryCount: 0,
  });
  assert.equal(spec.immutableObjectStorage, false);
  assert.equal(spec.ingested, false);
  assert.equal(spec.productionEligible, false);
});

test("transform script refuses overwrite and validates geometry plus lossless fingerprints", () => {
  assert.match(script, /--raw-archive/);
  assert.match(script, /--verify-existing/);
  assert.match(script, /raw archive checksum does not match/);
  assert.match(script, /refusing to overwrite an existing output or evidence file/);
  assert.match(script, /contentSha256/);
  assert.match(script, /invalidGeometryCount/);
  assert.match(script, /geometryOperation.*none/);
  assert.match(script, /rawArchiveSha256/);
});

test("verified run evidence remains checksum-bound and non-production", () => {
  assert.equal(run.rawArchiveSha256, spec.rawArchiveSha256);
  assert.equal(run.output.byteLength, 1017495552);
  assert.equal(run.output.sha256, "7b0749f5a237f1abb3cf110c5748ed5cbdc8afa738beb021bba68a19927a24a8");
  assert.deepEqual(run.layers.map(({ name, featureCount, invalidGeometryCount }) => ({ name, featureCount, invalidGeometryCount })), [
    { name: "feux_prov", featureCount: 94572, invalidGeometryCount: 0 },
    { name: "meta_feux_prov", featureCount: 94572, invalidGeometryCount: 0 },
  ]);
  assert.equal(run.immutableObjectStorage, false);
  assert.equal(run.ingested, false);
  assert.equal(run.productionEligible, false);
});
