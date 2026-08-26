import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertZonalAggregationSidecar, type ZonalAggregationSidecar } from "../lib/phase2/zonal-aggregation.js";
import { validatePhase2V21ProvinceZonalPilotEvidence } from "./check-phase2-v21-province-zonal-pilot-evidence.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRECTORY = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/phase2-v21-zonal-province-2021-cbf-v5";
const OUTPUT = "province-2020-2022.json";
const SIDECAR = "province-2020-2022.sidecar.json";
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

async function regularUnsymlinkedFile(file: string): Promise<void> {
  const info = await lstat(file);
  assert.equal(info.isSymbolicLink(), false, `${file} must not be a symlink.`);
  assert.equal(info.isFile(), true, `${file} must be a regular file.`);
}

export async function readbackPhase2V21ProvinceZonalPilot(): Promise<void> {
  assert.equal(await realpath(DIRECTORY), DIRECTORY, "The canonical pilot directory must not resolve through a symlink.");
  assert.deepEqual((await readdir(DIRECTORY)).sort(), [OUTPUT, SIDECAR].sort(), "The pilot directory must contain exactly the two recorded artifacts.");
  const outputPath = path.join(DIRECTORY, OUTPUT);
  const sidecarPath = path.join(DIRECTORY, SIDECAR);
  await regularUnsymlinkedFile(outputPath); await regularUnsymlinkedFile(sidecarPath);
  const [outputBytes, sidecarBytes, evidenceBytes, rasterEvidenceBytes] = await Promise.all([
    readFile(outputPath), readFile(sidecarPath),
    readFile(path.join(ROOT, "data/phase2-v21-province-zonal-pilot-evidence.json")),
    readFile(path.join(ROOT, "data/phase2-v21-raster-readback-evidence.json")),
  ]);
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const rasterEvidence = JSON.parse(rasterEvidenceBytes.toString("utf8"));
  validatePhase2V21ProvinceZonalPilotEvidence(evidence, rasterEvidence);
  // The admitted run's worker bytes are frozen under data/provenance so this binding stays verifiable after the
  // live scripts/phase2_zonal_aggregate.py changes. The record's name derives from the digest it must hash to.
  const workerBytes = await readFile(path.join(ROOT, `data/provenance/phase2_zonal_aggregate.admitted-${String(evidence.run.workerSha256).slice(0, 8)}.py`));
  assert.deepEqual({ path: OUTPUT, byteLength: outputBytes.byteLength, sha256: sha(outputBytes) }, evidence.artifacts.output);
  assert.deepEqual({ path: SIDECAR, byteLength: sidecarBytes.byteLength, sha256: sha(sidecarBytes) }, evidence.artifacts.sidecar);
  const output = JSON.parse(outputBytes.toString("utf8"));
  const sidecar = assertZonalAggregationSidecar(JSON.parse(sidecarBytes.toString("utf8")) as ZonalAggregationSidecar);
  assert.equal(sidecar.outputByteLength, outputBytes.byteLength);
  assert.equal(sidecar.outputSha256, sha(outputBytes));
  assert.deepEqual(sidecar.rows, output);
  assert.equal(sidecar.execution.workerSha256, sha(workerBytes));
  assert.equal(sidecar.execution.workerSha256, evidence.run.workerSha256);
  assert.equal(sidecar.execution.codeVersion, evidence.run.codeVersion);
  assert.deepEqual(sidecar.rows.map(({ boundaryId }) => boundaryId), evidence.result.boundaryIds);
  assert.equal(sidecar.rows.every(({ coverageGrade }) => coverageGrade === evidence.result.allCoverageGrades), true);
  assert.equal(sidecar.input.forestMaskSha256, evidence.inputBindings.forestMask.sha256);
  assert.equal(sidecar.input.changeRasterSha256, evidence.inputBindings.changeRaster.sha256);
  assert.equal(sidecar.input.boundarySha256, evidence.inputBindings.boundary.sha256);
  assert.equal(sidecar.input.gridCrsSha256, evidence.inputBindings.gridCrsSha256);
  assert.equal(sidecar.input.boundaryEdition, evidence.inputBindings.boundary.edition);
  assert.equal(sidecar.input.boundaryIdField, evidence.inputBindings.boundary.idField);
  assert.equal(sidecar.input.forestMaskVersion, evidence.inputBindings.forestMask.version);
  assert.equal(sidecar.input.changeRasterVersion, evidence.inputBindings.changeRaster.version);
  assert.equal(sidecar.input.timeVersion, evidence.inputBindings.timeVersion);
  assert.equal(sidecar.input.sourceVersion, evidence.inputBindings.sourceLineageSha256);
  assert.equal(sidecar.input.boundaryGeometryReadPolicy, evidence.inputBindings.boundary.geometryReadPolicy);
  assert.equal(sidecar.input.reprojection, evidence.inputBindings.boundary.reprojection);
  assert.equal(sidecar.input.boundaryClassification, "authoritative-boundary");
  assert.equal(sidecar.input.admissionStatus, "not-admitted");
  assert.equal(sidecar.input.admissionRecord, null);
  assert.equal(sidecar.productionClaim, false);
  assert.equal(sidecar.nationalPerCellGeometryMaterialized, false);
  assert.equal((await stat(outputPath)).size, evidence.artifacts.output.byteLength);
  console.log(`Phase 2 2020–2022 province/territory zonal pilot readback passed: ${sidecar.rows.length} rows, local and non-admitted.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await readbackPhase2V21ProvinceZonalPilot();
