import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const SHA = /^[a-f0-9]{64}$/;
const IDS = ["10", "11", "12", "13", "24", "35", "46", "47", "48", "59", "60", "61", "62"];
const ADMITTED_WORKER = "ba331f904d73c6f0ecf77a87029154b00d539a366c06c2e69863f531d32b1a41";
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted.`);
const bytes = (path) => readFileSync(new URL(path, root));
const digest = (value) => createHash("sha256").update(value).digest("hex");
// The v6 worker has not been admitted. Its frozen bytes therefore live under a candidate- name rather than the
// admitted- name the v5 record uses, so the filename never asserts an admission that no owner has made. The name
// still derives from the digest it must hash to, so the record cannot be swapped without breaking that equality.
const candidateWorkerRecord = (workerSha256) =>
  `data/provenance/phase2_zonal_aggregate.candidate-${workerSha256.slice(0, 8)}.py`;
const artifact = (value, path) => {
  exactKeys(value, ["path", "byteLength", "sha256"], path);
  assert.equal(value.path, path);
  assert.ok(Number.isSafeInteger(value.byteLength) && value.byteLength > 0);
  assert.match(value.sha256, SHA);
};

export function validatePhase2V21ProvinceZonalPilotV6Evidence(evidence, rasterEvidence, admittedEvidence) {
  exactKeys(evidence, ["schemaVersion", "status", "run", "artifacts", "inputBindings", "result", "reproduction", "claims", "redaction"], "evidence");
  assert.equal(evidence.schemaVersion, "witness-tree/phase2-v21-province-zonal-pilot-evidence/1");
  assert.equal(evidence.status, "local-readback-passed-not-admitted");
  exactKeys(evidence.run, ["batchId", "workerPath", "workerSha256", "codeVersion"], "run");
  assert.equal(evidence.run.batchId, "phase2-v21-zonal-province-2021-cbf-v6");
  assert.equal(evidence.run.workerPath, "scripts/phase2_zonal_aggregate.py");
  assert.match(evidence.run.workerSha256, SHA);
  assert.notEqual(evidence.run.workerSha256, ADMITTED_WORKER, "The v6 record must describe the portable worker, not the admitted one.");
  assert.equal(evidence.run.workerSha256, digest(bytes(candidateWorkerRecord(evidence.run.workerSha256))));
  assert.equal(evidence.run.codeVersion, `main@c1a997e+worker-${evidence.run.workerSha256}`);
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

  // The reproduction claim is the point of this record, so it is bound to the admitted evidence rather than
  // restated. If either output digest is ever edited, this equality fails instead of the claim quietly becoming
  // false. The three inputs are bound above, so "same inputs" is checked rather than asserted in prose.
  const reproduction = evidence.reproduction;
  exactKeys(reproduction, ["reproducesBatchId", "reproducedOutputSha256", "outputIsByteIdenticalToAdmittedRun", "admittedRunWorkerSha256", "note"], "reproduction");
  assert.equal(reproduction.reproducesBatchId, admittedEvidence.run.batchId);
  assert.equal(reproduction.admittedRunWorkerSha256, admittedEvidence.run.workerSha256);
  assert.equal(reproduction.reproducedOutputSha256, evidence.artifacts.output.sha256);
  assert.equal(reproduction.outputIsByteIdenticalToAdmittedRun, reproduction.reproducedOutputSha256 === admittedEvidence.artifacts.output.sha256);
  assert.equal(reproduction.outputIsByteIdenticalToAdmittedRun, true, "The portable worker must reproduce the admitted output byte for byte.");
  assert.deepEqual(input.forestMask, admittedEvidence.inputBindings.forestMask);
  assert.deepEqual(input.changeRaster, admittedEvidence.inputBindings.changeRaster);
  assert.deepEqual(input.boundary, admittedEvidence.inputBindings.boundary);

  assert.deepEqual(evidence.claims, { boundaryAggregatesComputedLocally: true, admittedNationalBoundaryAggregatesExist: false, admitted: false, released: false, productionEligible: false, externalAction: false });
  assert.match(evidence.redaction, /Absolute local paths.*CRS WKT.*not copied/i);
  return evidence;
}

export function checkPhase2V21ProvinceZonalPilotV6Evidence() {
  const evidence = JSON.parse(bytes("data/phase2-v21-province-zonal-pilot-v6-evidence.json"));
  const rasterEvidence = JSON.parse(bytes("data/phase2-v21-raster-readback-evidence.json"));
  const admittedEvidence = JSON.parse(bytes("data/phase2-v21-province-zonal-pilot-evidence.json"));
  return validatePhase2V21ProvinceZonalPilotV6Evidence(evidence, rasterEvidence, admittedEvidence);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const evidence = checkPhase2V21ProvinceZonalPilotV6Evidence();
  console.log(`Phase 2 V2.1 province zonal v6 evidence: portable worker ${evidence.run.workerSha256.slice(0, 8)} reproduced the admitted ${evidence.reproduction.admittedRunWorkerSha256.slice(0, 8)} output byte for byte; not admitted, not released.`);
}
