import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = path.join(root, "scripts/phase2_zonal_aggregate.py");
const fixture = path.join(root, "tests/fixtures/phase2-zonal-aggregation-gdal-fixture.py");

function run(args, cwd) {
  return execFileSync("python3", [worker, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function baseArgs(dir, output, sidecar) {
  return ["--forest-mask", path.join(dir, "forest-mask.tif"), "--change-raster", path.join(dir, "change-raster.tif"),
    "--boundaries", path.join(dir, "boundaries.geojson"), "--output", output, "--sidecar", sidecar,
    "--boundary-edition", "fixture-2026", "--forest-mask-version", "forest-fixture-v1", "--change-raster-version", "change-fixture-v1",
    "--time-version", "2020-2022", "--source-version", "fixture-v1", "--code-version", "fixture-code-v1", "--boundary-classification", "illustrative", "--admission-status", "not-admitted"];
}

test("GDAL worker aggregates only bounded vector windows and preserves Unknown hectares", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const output = path.join(dir, "output.json");
    const sidecar = path.join(dir, "sidecar.json");
    run(baseArgs(dir, output, sidecar), dir);
    const rows = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(rows, [
      { boundaryId: "west", knownForestedHectares: 1, lossHectares: 1, unknownRequiredInputHectares: 0, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: 100 },
      { boundaryId: "east", knownForestedHectares: 1, lossHectares: 0, unknownRequiredInputHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "partial-with-unknown", observedLossPercent: 0 },
    ]);
    const evidence = JSON.parse(readFileSync(sidecar, "utf8"));
    assert.equal(evidence.algorithm, "windowed-bounded-feature-rasterization");
    assert.equal(evidence.nationalPerCellGeometryMaterialized, false);
    assert.equal(evidence.input.reprojection, "identical-crs");
    assert.equal(evidence.input.boundaryGeometryReadPolicy, "driver-default");
    assert.equal(evidence.input.boundaryIdField, "id");
    assert.equal(evidence.execution.codeVersion, "fixture-code-v1");
    assert.equal(evidence.execution.featureCount, 2);
    assert.equal(evidence.execution.parameters.nodata, 255);
    assert.ok(evidence.execution.elapsedSeconds > 0);
    assert.ok(evidence.execution.peakRssBytes > 0);
    assert.ok(evidence.execution.maximumScratchAllocatedBytes > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("GDAL worker rejects unsafe production claims, geographic hectare denominators, and unaligned grids", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-hostile-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    assert.throws(() => run([...baseArgs(dir, path.join(dir, "a.json"), path.join(dir, "a.sidecar.json")), "--production-claim"], dir), /authoritative geometry and an admitted input record/);
    const geographic = path.join(dir, "geographic.tif");
    execFileSync("python3", [fixture, "--geographic", geographic], { encoding: "utf8" });
    const geographicArgs = baseArgs(dir, path.join(dir, "b.json"), path.join(dir, "b.sidecar.json"));
    geographicArgs[1] = geographic;
    geographicArgs[3] = geographic;
    assert.throws(() => run(geographicArgs, dir), /projected CRS/);
    const mismatchArgs = baseArgs(dir, path.join(dir, "c.json"), path.join(dir, "c.sidecar.json"));
    mismatchArgs[3] = path.join(dir, "change-grid-mismatch.tif");
    assert.throws(() => run(mismatchArgs, dir), /exact grid, CRS, and geotransform/);
    const whitespaceAdmission = baseArgs(dir, path.join(dir, "d.json"), path.join(dir, "d.sidecar.json"));
    whitespaceAdmission.splice(whitespaceAdmission.indexOf("illustrative"), 1, "authoritative-boundary");
    whitespaceAdmission.splice(whitespaceAdmission.indexOf("not-admitted"), 1, "admitted");
    assert.throws(() => run([...whitespaceAdmission, "--admission-record", "   ", "--production-claim"], dir), /authoritative geometry and an admitted input record/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("GDAL worker records an actual bounded boundary reprojection", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-reproject-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const args = baseArgs(dir, path.join(dir, "reprojected.json"), path.join(dir, "reprojected.sidecar.json"));
    args[5] = path.join(dir, "boundaries-4326.geojson");
    run(args, dir);
    const sidecar = JSON.parse(readFileSync(path.join(dir, "reprojected.sidecar.json"), "utf8"));
    assert.equal(sidecar.input.reprojection, "reprojected");
    assert.match(sidecar.input.reprojectionEvidence, /CoordinateTransformation/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("GDAL worker binds the complete archive when OGR reads a /vsizip datasource", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-vsizip-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const archive = path.join(dir, "boundaries.zip");
    execFileSync("zip", ["-j", archive, path.join(dir, "boundaries.geojson")], { encoding: "utf8" });
    const args = baseArgs(dir, path.join(dir, "zipped.json"), path.join(dir, "zipped.sidecar.json"));
    args[5] = `/vsizip/${archive}`;
    run(args, dir);
    const sidecar = JSON.parse(readFileSync(path.join(dir, "zipped.sidecar.json"), "utf8"));
    assert.equal(sidecar.input.boundarySha256, createHash("sha256").update(readFileSync(archive)).digest("hex"));
    assert.equal(sidecar.input.boundaryGeometryReadPolicy, "driver-default");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("GDAL worker emits a zero-denominator row for a boundary wholly outside the raster", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-outside-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const boundaryPath = path.join(dir, "boundaries.geojson");
    const boundaries = JSON.parse(readFileSync(boundaryPath, "utf8"));
    boundaries.features.push({ type: "Feature", properties: { id: "outside" }, geometry: { type: "Polygon", coordinates: [[[1000, 1000], [1100, 1000], [1100, 1100], [1000, 1100], [1000, 1000]]] } });
    writeFileSync(boundaryPath, JSON.stringify(boundaries));
    run(baseArgs(dir, path.join(dir, "outside-grid.json"), path.join(dir, "outside-grid.sidecar.json")), dir);
    const rows = JSON.parse(readFileSync(path.join(dir, "outside-grid.json"), "utf8"));
    assert.deepEqual(rows.at(-1), { boundaryId: "outside", knownForestedHectares: 0, lossHectares: 0, unknownRequiredInputHectares: 0, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: null });
    const sidecar = JSON.parse(readFileSync(path.join(dir, "outside-grid.sidecar.json"), "utf8"));
    assert.equal(sidecar.execution.featureCount, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("GDAL worker discloses and excludes observed loss outside the first-year forest denominator", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-zonal-policy-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const args = baseArgs(dir, path.join(dir, "outside.json"), path.join(dir, "outside.sidecar.json"));
    args[3] = path.join(dir, "change-loss-outside-forest.tif");
    run(args, dir);
    const rows = JSON.parse(readFileSync(path.join(dir, "outside.json"), "utf8"));
    assert.equal(rows.reduce((sum, row) => sum + row.observedLossOutsideFirstYearForestHectares, 0), 1);
    assert.equal(rows.reduce((sum, row) => sum + row.lossHectares, 0), 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
