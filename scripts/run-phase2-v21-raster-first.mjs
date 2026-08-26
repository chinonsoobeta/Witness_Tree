import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, isAbsolute, join, resolve } from "node:path";

import { sourceBackedPhase2RealNationalPreflight } from "./preflight-phase2-real-national-run.mjs";

const PYTHON = new URL("./phase2_v21_raster_window.py", import.meta.url).pathname;
const SNAPSHOTS = [1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022];
const INTERVALS = SNAPSHOTS.slice(0, -1).map((fromYear, index) => ({ fromYear, toYear: SNAPSHOTS[index + 1] }));
const V1_BATCH = "phase2-real-national-1984-2022-v1";
const V21_BATCH = "phase2-v21-raster-first-1984-2022-v1";
const sha = async (file) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const codeProvenance = async () => ({ runnerSha256: await sha(new URL(import.meta.url)), workerSha256: await sha(PYTHON) });
const mustExist = async (file) => { await access(file); return file; };

function runPython(mode, output, inputs) {
  const result = spawnSync("python3", [PYTHON, mode, output, ...inputs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 96 * 60 * 60 * 1000 });
  if (result.status !== 0) throw new Error(`V2.1 raster worker failed: ${result.error?.message || result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function inputRecord(file, kind, years) {
  const details = await stat(file);
  return { kind, ...years, path: file, byteLength: details.size, sha256: await sha(file) };
}

function gridSidecar(grid) {
  return { gridId: "vlce2-lcc-nad83", crs: grid.grid.crs.wkt, crsProj4: grid.grid.crs.proj4, geotransform: grid.grid.geotransform, noDataValue: 255, width: grid.grid.width, height: grid.grid.height };
}

function assertObservedGrid(telemetry, expected) {
  assert.deepEqual({
    width: telemetry.outputGrid.width,
    height: telemetry.outputGrid.height,
    geotransform: telemetry.outputGrid.geotransform,
    crsProj4: telemetry.outputGrid.crsProj4,
    nodataValue: telemetry.outputGrid.nodataValue,
    dataType: telemetry.outputGrid.dataType,
  }, {
    width: expected.width, height: expected.height, geotransform: expected.geotransform,
    crsProj4: expected.crsProj4, nodataValue: expected.noDataValue, dataType: "Byte",
  }, "Worker-observed output grid must exactly equal the V2.1 contract grid.");
  assert.equal(telemetry.outputGrid.crsSha256, createHash("sha256").update(telemetry.outputGrid.crs).digest("hex"), "Observed output WKT hash must bind the retained WKT representation.");
}

async function writeSidecar(sidecars, record) {
  const filename = `${record.kind}-${record.fromYear ?? record.year}-${record.toYear ?? "snapshot"}.json`;
  await writeFile(join(sidecars, filename), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  return `sidecars/${filename}`;
}

export async function preflightV21RasterFirst(dataRoot, output) {
  assert.ok(isAbsolute(dataRoot) && basename(dataRoot) === "Witness_Tree-data", "Data root must be the explicit absolute Witness_Tree-data directory.");
  assert.ok(isAbsolute(output), "Output must be an explicit absolute directory.");
  assert.equal(output, join(dataRoot, "derived", V21_BATCH), "Output must be the exact approved V2.1 derived batch path.");
  const historical = join(dataRoot, "derived", V1_BATCH);
  const [grid, historicalLineage] = await Promise.all([json(new URL("../data/raster-grid.json", import.meta.url)), json(join(historical, "lineage.json"))]);
  const snapshots = await Promise.all(SNAPSHOTS.map(async (year) => inputRecord(await mustExist(join(historical, "masks", `forest-mask-${year}.tif`)), "forest-mask", { year })));
  const losses = await Promise.all(Array.from({ length: 38 }, async (_, index) => { const fromYear = 1984 + index; return inputRecord(await mustExist(join(historical, "loss", `detected-forest-loss-${fromYear}-${fromYear + 1}.tif`)), "annual-loss", { fromYear, toYear: fromYear + 1 }); }));
  return { schemaVersion: "witness-tree/phase2-v21-raster-first-preflight/1", status: "ready-for-local-nonproduction-execution", batchId: V21_BATCH, output, inputBatch: V1_BATCH, inputLineageSha256: await sha(join(historical, "lineage.json")), inputLineageBatchId: historicalLineage.batchId, snapshots, losses, grid: gridSidecar(grid), codeProvenance: await codeProvenance(), concurrency: 1, productionEligible: false };
}

export async function runV21RasterFirst(dataRootArg, outputArg) {
  const dataRoot = resolve(dataRootArg), output = resolve(outputArg);
  const preflight = await preflightV21RasterFirst(dataRoot, output);
  await access(output).then(() => { throw new Error("Refusing to use an existing V2.1 output directory."); }, () => undefined);
  const sourcePreflight = await sourceBackedPhase2RealNationalPreflight(dataRoot);
  assert.equal(sourcePreflight.status, "ready-for-bounded-nonproduction-execution");
  const started = new Date().toISOString(); const startedMs = Date.now();
  await mkdir(output, { recursive: false });
  try {
  const sidecars = join(output, "sidecars"); await mkdir(sidecars);
  const outputs = [];
  for (const source of preflight.snapshots) {
    const target = join(output, `forest-mask-snapshot-${source.year}.tif`);
    const telemetry = runPython("snapshot", target, [source.path]);
    const details = await stat(target);
    assertObservedGrid(telemetry, preflight.grid);
    const record = { schemaVersion: "witness-tree/phase2-v21-raster-sidecar/1", batchId: V21_BATCH, kind: "forest-mask-snapshot", year: source.year, inputs: [source], output: { path: basename(target), byteLength: details.size, sha256: await sha(target) }, ...preflight.grid, methodVersion: "phase2-v21-whole-interval-raster-first/1", codeProvenance: preflight.codeProvenance, telemetry, productionEligible: false, released: false };
    outputs.push({ ...record, sidecar: await writeSidecar(sidecars, record) });
  }
  for (const interval of INTERVALS) {
    const inputs = preflight.losses.filter((row) => row.fromYear >= interval.fromYear && row.toYear <= interval.toYear);
    assert.equal(inputs.length, interval.toYear - interval.fromYear, "Every interval must use every adjacent annual loss raster.");
    const target = join(output, `whole-interval-loss-${interval.fromYear}-${interval.toYear}.tif`);
    const telemetry = runPython("interval", target, inputs.map((input) => input.path));
    const details = await stat(target);
    assertObservedGrid(telemetry, preflight.grid);
    const record = { schemaVersion: "witness-tree/phase2-v21-raster-sidecar/1", batchId: V21_BATCH, kind: "whole-interval-loss", ...interval, inputs, output: { path: basename(target), byteLength: details.size, sha256: await sha(target) }, ...preflight.grid, methodVersion: "phase2-v21-whole-interval-raster-first/1", codeProvenance: preflight.codeProvenance, telemetry, productionEligible: false, released: false };
    outputs.push({ ...record, sidecar: await writeSidecar(sidecars, record) });
  }
  const completed = new Date().toISOString();
  const lineage = { schemaVersion: "witness-tree/phase2-v21-raster-first-lineage/1", batchId: V21_BATCH, status: "local-nonproduction-executed", sourcePreflight: { status: sourcePreflight.status, inputSetSha256: sourcePreflight.sourceVerification.inputSetSha256 }, preflight, execution: { started, completed, elapsedSeconds: (Date.now() - startedMs) / 1000, concurrency: 1, noPerCellPolygons: true }, outputs, claims: { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false } };
  await writeFile(join(output, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`, { flag: "wx" });
  return lineage;
  } catch (error) {
    await writeFile(join(output, "RUN_FAILED_NON_EVIDENCE.json"), `${JSON.stringify({ schemaVersion: "witness-tree/phase2-v21-raster-first-failed-run/1", status: "failed-not-evidence", error: error instanceof Error ? error.message : String(error), productionEligible: false, released: false, admitted: false }, null, 2)}\n`, { flag: "wx" }).catch(() => undefined);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , dataRoot, output] = process.argv;
  if (!dataRoot || !output) throw new Error("Usage: run-phase2-v21-raster-first <absolute-Witness_Tree-data> <new-absolute-derived-output-directory>");
  console.log(JSON.stringify(await runV21RasterFirst(dataRoot, output), null, 2));
}
