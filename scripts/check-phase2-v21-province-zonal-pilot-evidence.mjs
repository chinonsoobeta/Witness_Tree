import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const SHA = /^[a-f0-9]{64}$/;
const IDS = ["10", "11", "12", "13", "24", "35", "46", "47", "48", "59", "60", "61", "62"];
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted.`);
const bytes = (path) => readFileSync(new URL(path, root));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const admittedWorkerRecord = (workerSha256) =>
  `data/provenance/phase2_zonal_aggregate.admitted-${workerSha256.slice(0, 8)}.py`;
const artifact = (value, path) => {
  exactKeys(value, ["path", "byteLength", "sha256"], path);
  assert.equal(value.path, path);
  assert.ok(Number.isSafeInteger(value.byteLength) && value.byteLength > 0);
  assert.match(value.sha256, SHA);
};

export function validatePhase2V21ProvinceZonalPilotEvidence(evidence, rasterEvidence) {
  exactKeys(evidence, ["schemaVersion", "status", "run", "artifacts", "inputBindings", "result", "claims", "redaction"], "evidence");
  assert.equal(evidence.schemaVersion, "witness-tree/phase2-v21-province-zonal-pilot-evidence/1");
  assert.equal(evidence.status, "local-readback-passed-not-admitted");
  exactKeys(evidence.run, ["batchId", "workerPath", "workerSha256", "codeVersion"], "run");
  assert.equal(evidence.run.batchId, "phase2-v21-zonal-province-2021-cbf-v5");
  assert.equal(evidence.run.workerPath, "scripts/phase2_zonal_aggregate.py");
  assert.match(evidence.run.workerSha256, SHA);
  // evidence.run.workerSha256 records the bytes that evidence.run.workerPath held at run time. Those bytes are
  // frozen in a provenance record whose name derives from the recorded digest, so the binding stays verifiable
  // after the live worker changes. The live worker is deliberately not hashed here: re-running it produces a
  // sidecar naming a different worker digest, which fails this binding until a fresh owner admission is recorded.
  assert.equal(evidence.run.workerSha256, digest(bytes(admittedWorkerRecord(evidence.run.workerSha256))));
  assert.equal(evidence.run.codeVersion, `phase1/v21-safe-integration@0c4f547+worker-${evidence.run.workerSha256}`);
  exactKeys(evidence.artifacts, ["output", "sidecar"], "artifacts");
  artifact(evidence.artifacts.output, "province-2020-2022.json");
  artifact(evidence.artifacts.sidecar, "province-2020-2022.sidecar.json");

  const input = evidence.inputBindings;
  exactKeys(input, ["sourceRasterReadbackEvidence", "sourceLineageSha256", "forestMask", "changeRaster", "boundary", "timeVersion", "gridCrsSha256"], "input bindings");
  assert.deepEqual(input.sourceRasterReadbackEvidence, { path: "data/phase2-v21-raster-readback-evidence.json", sha256: digest(bytes("data/phase2-v21-raster-readback-evidence.json")) });
  assert.equal(input.sourceLineageSha256, rasterEvidence.lineage.sha256);
  const forest = rasterEvidence.outputs.find((row) => row.kind === "forest-mask-snapshot" && row.year === 2020);
  const change = rasterEvidence.outputs.find((row) => row.kind === "whole-interval-loss" && row.fromYear === 2020 && row.toYear === 2022);
  assert.deepEqual(input.forestMask, { version: "phase2-v21-raster-first-1984-2022-v1-snapshot-2020", sha256: forest?.raster.sha256 });
  assert.deepEqual(input.changeRaster, { version: "phase2-v21-raster-first-1984-2022-v1-interval-2020-2022", sha256: change?.raster.sha256 });
  assert.deepEqual(input.boundary, { edition: "2021-Census-cartographic-boundary", idField: "PRUID", sha256: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b", classification: "authoritative-boundary", geometryReadPolicy: "shapefile-ring-orientation-only-ccw", reprojection: "reprojected" });
  assert.equal(input.timeVersion, "2020-2022");
  assert.match(input.gridCrsSha256, SHA);
  assert.deepEqual(evidence.result, { featureCount: 13, boundaryIds: IDS, allCoverageGrades: "complete", outputMatchesSidecarRows: true, nationalPerCellGeometryMaterialized: false });
  assert.deepEqual(evidence.claims, { boundaryAggregatesComputedLocally: true, admittedNationalBoundaryAggregatesExist: false, admitted: false, released: false, productionEligible: false, externalAction: false });
  assert.match(evidence.redaction, /Absolute local paths.*CRS WKT.*not copied/i);
  return evidence;
}

export function checkPhase2V21ProvinceZonalPilotEvidence() {
  const evidence = JSON.parse(bytes("data/phase2-v21-province-zonal-pilot-evidence.json"));
  const rasterEvidence = JSON.parse(bytes("data/phase2-v21-raster-readback-evidence.json"));
  return validatePhase2V21ProvinceZonalPilotEvidence(evidence, rasterEvidence);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPhase2V21ProvinceZonalPilotEvidence();
  console.log("Phase 2 province/territory zonal pilot evidence is statically bound and remains non-admitted.");
}
