import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = path.join(root, "scripts/phase2_annual_zonal_aggregate.py");
const fixture = path.join(root, "tests/fixtures/phase2-annual-zonal-fixture.py");

function run(dir, output, sidecar, extra = []) {
  return execFileSync("python3", [worker,
    "--manifest", path.join(dir, "manifest.json"),
    "--boundaries", path.join(dir, "boundaries.geojson"),
    "--output", output, "--sidecar", sidecar,
    "--boundary-edition", "fixture-authoritative-2021",
    "--forest-mask-version", "annual-forest-fixture-v1",
    "--change-raster-version", "annual-loss-fixture-v1",
    "--time-version", "1984-2022",
    "--source-version", "fixture-v1",
    "--code-version", "fixture-code-v1",
    "--boundary-classification", "authoritative-boundary",
    "--admission-status", "not-admitted",
    ...extra], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("annual worker rasterizes four province masks once and emits a typed 1984 baseline", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const output = path.join(dir, "annual.json");
    const sidecar = path.join(dir, "annual.sidecar.json");
    run(dir, output, sidecar);
    const rows = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(rows.length, 4 * 39);
    assert.deepEqual(rows.filter((row) => row.rowType === "baseline").map((row) => row.boundaryId), ["59", "48", "35", "24"]);
    assert.deepEqual(rows.filter((row) => row.rowType === "annual").map((row) => [row.fromYear, row.toYear]).slice(0, 2), [[1984, 1985], [1985, 1986]]);
    const bcBaseline = rows.find((row) => row.boundaryId === "59" && row.rowType === "baseline");
    assert.deepEqual(bcBaseline, {
      boundaryId: "59", province: "BC", rowType: "baseline", baselineYear: 1984, fromYear: null, toYear: null,
      temporalSemantics: "1984 forest-mask snapshot only; no annual loss period or loss value is assigned",
      knownForestedHectares: 1, lossHectares: null, knownObservedLossHectares: null, unknownRequiredInputHectares: 0,
      observedLossOutsideFirstYearForestHectares: null, coverageGrade: "complete", observedLossPercent: null,
    });
    const first = rows.filter((row) => row.rowType === "annual" && row.fromYear === 1984);
    assert.deepEqual(first.map(({ boundaryId, knownForestedHectares, lossHectares, knownObservedLossHectares, unknownRequiredInputHectares, observedLossOutsideFirstYearForestHectares, coverageGrade, observedLossPercent }) => ({ boundaryId, knownForestedHectares, lossHectares, knownObservedLossHectares, unknownRequiredInputHectares, observedLossOutsideFirstYearForestHectares, coverageGrade, observedLossPercent })), [
      { boundaryId: "59", knownForestedHectares: 1, lossHectares: 1, knownObservedLossHectares: 1, unknownRequiredInputHectares: 0, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: 100 },
      { boundaryId: "48", knownForestedHectares: 1, lossHectares: 1, knownObservedLossHectares: 1, unknownRequiredInputHectares: 0, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: 100 },
      { boundaryId: "35", knownForestedHectares: 0, lossHectares: null, knownObservedLossHectares: 0, unknownRequiredInputHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "partial-with-unknown", observedLossPercent: null },
      { boundaryId: "24", knownForestedHectares: 0, lossHectares: 0, knownObservedLossHectares: 0, unknownRequiredInputHectares: 0, observedLossOutsideFirstYearForestHectares: 1, coverageGrade: "complete", observedLossPercent: null },
    ]);
    const evidence = JSON.parse(readFileSync(sidecar, "utf8"));
    assert.equal(evidence.execution.featureCount, 4);
    assert.equal(evidence.execution.annualPairCount, 38);
    assert.equal(evidence.execution.maskRasterizationCount, 4);
    assert.equal(evidence.execution.parameters.nodata, 255);
    assert.equal(evidence.nationalPerCellGeometryMaterialized, false);
    assert.deepEqual(evidence.claims, { admitted: false, released: false, productionEligible: false, externalAction: false });
    assert.equal(evidence.rows.length, 156);
    assert.equal(evidence.input.forestMasks.length, 38);
    assert.equal(evidence.input.annualLossRasters.length, 38);
    assert.equal(evidence.output.sha256, createHash("sha256").update(readFileSync(output)).digest("hex"));
    assert.equal(evidence.output.byteLength, readFileSync(output).byteLength);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("annual worker rejects a missing pair or a production claim", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-hostile-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const output = path.join(dir, "bad.json");
    const sidecar = path.join(dir, "bad.sidecar.json");
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.annualLossRasters.pop();
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => run(dir, output, sidecar), /38 adjacent annual pairs/);
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    assert.throws(() => run(dir, output, sidecar, ["--production-claim"]), /permanently nonproduction/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("annual worker fails closed on an unaligned annual raster grid", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-grid-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const bad = path.join(dir, "bad-grid.tif");
    execFileSync("python3", ["-c", [
      "from osgeo import gdal, osr; import numpy as np, sys",
      "d=gdal.GetDriverByName('GTiff').Create(sys.argv[1], 5, 1, 1, gdal.GDT_Byte); s=osr.SpatialReference(); s.ImportFromEPSG(3857); d.SetProjection(s.ExportToWkt()); d.SetGeoTransform([0,100,0,100,0,-100]); b=d.GetRasterBand(1); b.SetNoDataValue(255); b.WriteArray(np.array([[0,0,0,0,0]], dtype=np.uint8)); d.FlushCache()",
    ].join("\n"), bad], { encoding: "utf8" });
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.annualLossRasters[0].path = "bad-grid.tif";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => run(dir, path.join(dir, "bad-grid.json"), path.join(dir, "bad-grid.sidecar.json")), /exact reference grid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("annual worker fails closed on an invalid categorical value", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-values-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const bad = path.join(dir, "bad-value.tif");
    execFileSync("python3", ["-c", [
      "from osgeo import gdal, osr; import numpy as np, sys",
      "d=gdal.GetDriverByName('GTiff').Create(sys.argv[1], 4, 1, 1, gdal.GDT_Byte); s=osr.SpatialReference(); s.ImportFromEPSG(3857); d.SetProjection(s.ExportToWkt()); d.SetGeoTransform([0,100,0,100,0,-100]); b=d.GetRasterBand(1); b.SetNoDataValue(255); b.WriteArray(np.array([[2,0,0,0]], dtype=np.uint8)); d.FlushCache()",
    ].join("\n"), bad], { encoding: "utf8" });
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.annualLossRasters[0].path = "bad-value.tif";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => run(dir, path.join(dir, "bad-value.json"), path.join(dir, "bad-value.sidecar.json")), /values must be exactly 0, 1, or 255/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
