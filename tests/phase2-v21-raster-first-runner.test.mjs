import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { resumeOutcome } from "../scripts/run-phase2-v21-raster-first.mjs";

const runner = await readFile(new URL("../scripts/run-phase2-v21-raster-first.mjs", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/phase2_v21_raster_window.py", import.meta.url), "utf8");

test("V2.1 runner has the exact selected snapshots and every whole interval", () => {
  assert.match(runner, /const SNAPSHOTS = \[1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022\]/);
  assert.match(runner, /inputs\.length, interval\.toYear - interval\.fromYear/);
  assert.match(runner, /concurrency: 1/);
  assert.match(runner, /Refusing to use an existing V2\.1 output directory/);
  assert.match(runner, /--resume/);
  assert.match(runner, /identity-bound completed product/);
  assert.match(runner, /noPerCellPolygons: true/);
});

function resumeFixture() {
  const crs = "V2.1 test WKT";
  const grid = { gridId: "test-grid", crs, crsProj4: "+proj=longlat", geotransform: [0, 1, 0, 0, 0, -1], noDataValue: 255, width: 2, height: 2 };
  const identity = {
    schemaVersion: "witness-tree/phase2-v21-raster-sidecar/1",
    batchId: "phase2-v21-raster-first-1984-2022-v1",
    kind: "forest-mask-snapshot",
    year: 2020,
    inputs: [{ kind: "forest-mask", year: 2020, path: "/input.tif", byteLength: 7, sha256: "a".repeat(64) }],
    ...grid,
    methodVersion: "phase2-v21-whole-interval-raster-first/2",
    codeProvenance: { runnerSha256: "b".repeat(64), workerSha256: "c".repeat(64) },
    productionEligible: false,
    released: false,
  };
  const telemetry = { outputGrid: { width: 2, height: 2, geotransform: grid.geotransform, crsProj4: grid.crsProj4, nodataValue: 255, dataType: "Byte", crs, crsSha256: "" }, elapsedSeconds: 1, peakRssBytes: 2, scratchDiskPeakBytes: 0, window: [2, 2] };
  telemetry.outputGrid.crsSha256 = createHash("sha256").update(crs).digest("hex");
  const plan = { output: "/output/forest-mask-snapshot-2020.tif", sidecar: "/output/sidecars/forest-mask-snapshot-2020-snapshot.json", relativeOutput: "forest-mask-snapshot-2020.tif", relativeSidecar: "sidecars/forest-mask-snapshot-2020-snapshot.json", identity };
  const sidecar = { ...identity, output: { path: plan.relativeOutput, byteLength: 3, sha256: "d".repeat(64) }, telemetry };
  return { plan, sidecar };
}

test("identity-bound resume produces missing pairs and skips only exact pairs", async () => {
  const { plan, sidecar } = resumeFixture();
  const files = new Set([plan.output, plan.sidecar]);
  const present = (file) => files.has(file);
  const readSidecar = () => structuredClone(sidecar);
  const hashOutput = () => sidecar.output.sha256;
  const sizeOutput = () => sidecar.output.byteLength;
  assert.deepEqual(await resumeOutcome({ ...plan, output: "/output/missing.tif", sidecar: "/output/sidecars/missing.json" }, readSidecar, hashOutput, sizeOutput, () => false), { action: "produce" });
  assert.deepEqual((await resumeOutcome(plan, readSidecar, hashOutput, sizeOutput, present)).action, "skip");
  files.delete(plan.sidecar);
  await assert.rejects(() => resumeOutcome(plan, readSidecar, hashOutput, sizeOutput, present), /incomplete prior output/);
});

test("identity-bound resume rejects foreign or byte-drifted pairs", async () => {
  const { plan, sidecar } = resumeFixture();
  const files = new Set([plan.output, plan.sidecar]);
  const present = (file) => files.has(file);
  const hashOutput = () => sidecar.output.sha256;
  const sizeOutput = () => sidecar.output.byteLength;
  const readSidecar = () => structuredClone(sidecar);
  sidecar.batchId = "foreign-batch";
  await assert.rejects(() => resumeOutcome(plan, readSidecar, hashOutput, sizeOutput, present), /identity field: batchId/);
  sidecar.batchId = plan.identity.batchId;
  await assert.rejects(() => resumeOutcome(plan, readSidecar, () => "e".repeat(64), sizeOutput, present), /SHA-256/);
});

test("identity-bound resume rejects extra claims and malformed window telemetry", async () => {
  const { plan, sidecar } = resumeFixture();
  const present = () => true;
  const hashOutput = () => sidecar.output.sha256;
  const sizeOutput = () => sidecar.output.byteLength;
  sidecar.admitted = true;
  await assert.rejects(() => resumeOutcome(plan, () => structuredClone(sidecar), hashOutput, sizeOutput, present), /unexpected or missing fields/);
  delete sidecar.admitted;
  sidecar.telemetry.window = [2048];
  await assert.rejects(() => resumeOutcome(plan, () => structuredClone(sidecar), hashOutput, sizeOutput, present), /invalid window telemetry/);
});

test("V2.1 worker is windowed, raster-only, and preserves Unknown", () => {
  assert.match(worker, /WINDOW = 2048/);
  assert.match(worker, /NODATA = 255/);
  assert.match(worker, /np\.any\(stack == 1, axis=0\), 1, np\.where\(np\.any\(stack == NODATA, axis=0\), NODATA, 0\)/);
  assert.match(worker, /does not have the exact reference grid, CRS, geotransform, and nodata/);
  assert.match(worker, /gdal\.Open\(args\.output, gdal\.GA_ReadOnly\)/);
  assert.doesNotMatch(worker, /from osgeo import ogr|Polygonize|RasterToPolygon/i);
});

test("sidecars bind source and output bytes, code, grid, and measurements", () => {
  for (const token of ["byteLength", "sha256", "codeProvenance", "runnerSha256", "workerSha256", "geotransform", "crsProj4", "lineage.json"]) {
    assert.ok(runner.includes(token), `runner missing ${token}`);
  }
  for (const token of ["peakRssBytes", "scratchDiskPeakBytes"]) assert.ok(worker.includes(token), `worker missing ${token}`);
  assert.match(runner, /productionEligible: false/);
  assert.match(runner, /released: false/);
});

test("worker actually rejects grid, Byte type, nodata, and value violations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "witness-tree-v21-raster-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const setup = [
    "from osgeo import gdal, osr; import numpy as np, os, sys",
    "d=sys.argv[1]; drv=gdal.GetDriverByName('GTiff'); s=osr.SpatialReference(); s.ImportFromEPSG(4326)",
    "def w(n,a,typ=gdal.GDT_Byte,nodata=255,wid=2):",
    " x=drv.Create(os.path.join(d,n),wid,2,1,typ); x.SetProjection(s.ExportToWkt()); x.GetRasterBand(1).SetNoDataValue(nodata); x.GetRasterBand(1).WriteArray(np.array(a,dtype=np.uint16 if typ != gdal.GDT_Byte else np.uint8)); x.FlushCache()",
    "w('good-a.tif',[[0,255],[1,0]]); w('good-b.tif',[[0,0],[255,0]]); w('bad-grid.tif',[[0,0,0],[0,0,0]],wid=3); w('bad-type.tif',[[0,0],[0,0]],typ=gdal.GDT_UInt16); w('bad-nodata.tif',[[0,0],[0,0]],nodata=0); w('bad-value.tif',[[2,0],[0,0]])",
  ].join("\n");
  const python = process.env.PYTHON || "python3";
  assert.equal(spawnSync(python, ["-c", setup, directory], { encoding: "utf8" }).status, 0);
  const run = (...names) => spawnSync(python, [new URL("../scripts/phase2_v21_raster_window.py", import.meta.url).pathname, "interval", join(directory, `out-${names.join("-")}.tif`), ...names.map((name) => join(directory, name))], { encoding: "utf8" });
  const good = run("good-a.tif", "good-b.tif");
  assert.equal(good.status, 0, `${good.stderr}\n${good.stdout}`);
  for (const bad of ["bad-grid.tif", "bad-type.tif", "bad-nodata.tif", "bad-value.tif"]) assert.notEqual(run("good-a.tif", bad).status, 0, `${bad} must fail closed`);
});
