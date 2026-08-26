import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { resolveDataRoot } from "./data-root.mjs";

const DATA_ROOT = resolveDataRoot();
const BATCH = "phase2-v21-raster-first-1984-2022-v1";
const SNAPSHOTS = [1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022];
const INTERVALS = SNAPSHOTS.slice(0, -1).map((fromYear, index) => ({ fromYear, toYear: SNAPSHOTS[index + 1] }));
const evidencePath = new URL("../data/phase2-v21-raster-readback-evidence.json", import.meta.url).pathname;
const runnerPath = new URL("./run-phase2-v21-raster-first.mjs", import.meta.url).pathname;
const workerPath = new URL("./phase2_v21_raster_window.py", import.meta.url).pathname;
const gridPath = new URL("../data/raster-grid.json", import.meta.url).pathname;

async function sha(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
function fail(message) { throw new Error(`Phase 2 V2.1 readback failed: ${message}`); }
function exact(value, expected, label) { try { assert.deepEqual(value, expected); } catch { fail(`${label} does not exactly match the Version 2.1 contract.`); } }
function safeRelative(value, label) { if (typeof value !== "string" || isAbsolute(value) || value.includes("..")) fail(`${label} must be a safe relative path.`); return value; }
function positive(value, label) { if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) fail(`${label} must be positive.`); }

export function validateV21LineageShape(lineage) {
  if (lineage?.schemaVersion !== "witness-tree/phase2-v21-raster-first-lineage/1") fail("unexpected lineage schema.");
  if (lineage.batchId !== BATCH || lineage.status !== "local-nonproduction-executed") fail("unexpected batch identity or status.");
  exact(lineage.claims, { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false }, "lineage claims");
  if (lineage.execution?.noPerCellPolygons !== true || lineage.execution?.concurrency !== 1) fail("lineage does not prove raster-only serial execution.");
  positive(lineage.execution.elapsedSeconds, "execution elapsedSeconds");
  if (!Array.isArray(lineage.outputs) || lineage.outputs.length !== 21) fail("lineage must contain exactly 11 snapshots and 10 intervals.");
  const snapshots = lineage.outputs.filter((row) => row.kind === "forest-mask-snapshot");
  const intervals = lineage.outputs.filter((row) => row.kind === "whole-interval-loss");
  if (snapshots.length !== 11 || intervals.length !== 10) fail("lineage output kinds are incomplete.");
  exact(snapshots.map((row) => row.year), SNAPSHOTS, "snapshot years");
  exact(intervals.map(({ fromYear, toYear }) => ({ fromYear, toYear })), INTERVALS, "whole intervals");
  for (const row of lineage.outputs) {
    if (row.productionEligible !== false || row.released !== false) fail("an output claims admission or release.");
    safeRelative(row.output?.path, "output path"); safeRelative(row.sidecar, "sidecar path");
    positive(row.output?.byteLength, "output byte length");
    if (!/^[0-9a-f]{64}$/.test(row.output?.sha256 ?? "")) fail("output SHA-256 is invalid.");
    if (!Array.isArray(row.inputs) || row.inputs.length < 1) fail("an output has no inputs.");
    for (const input of row.inputs) { positive(input.byteLength, "input byte length"); if (!/^[0-9a-f]{64}$/.test(input.sha256 ?? "")) fail("input SHA-256 is invalid."); }
    if (row.kind === "forest-mask-snapshot" && row.inputs.length !== 1) fail("snapshot has more than one input.");
    if (row.kind === "whole-interval-loss") {
      const expected = Array.from({ length: row.toYear - row.fromYear }, (_, i) => [row.fromYear + i, row.fromYear + i + 1]);
      exact(row.inputs.map(({ fromYear, toYear }) => [fromYear, toYear]), expected, `annual inputs for ${row.fromYear}-${row.toYear}`);
    }
    const telemetry = row.telemetry;
    positive(telemetry?.elapsedSeconds, "worker elapsedSeconds"); positive(telemetry?.peakRssBytes, "worker peakRssBytes");
    if (!(typeof telemetry?.scratchDiskPeakBytes === "number" && telemetry.scratchDiskPeakBytes >= 0)) fail("worker scratchDiskPeakBytes is invalid.");
    if (!Array.isArray(telemetry?.window) || telemetry.window.some((v) => !Number.isInteger(v) || v <= 0)) fail("worker window is invalid.");
  }
  return { snapshots, intervals };
}

function observedGdal(file, expected) {
  const result = spawnSync("gdalinfo", ["-json", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalinfo cannot read ${basename(file)}: ${result.stderr || result.stdout}`);
  const info = JSON.parse(result.stdout);
  exact(info.size, [expected.width, expected.height], `${basename(file)} size`);
  exact(info.geoTransform, expected.geotransform, `${basename(file)} geotransform`);
  if (info.bands?.length !== 1 || info.bands[0].type !== "Byte" || info.bands[0].noDataValue !== 255) fail(`${basename(file)} must be one-band Byte with nodata 255.`);
  if (typeof info.coordinateSystem?.wkt !== "string" || !info.coordinateSystem.wkt) fail(`${basename(file)} has no readable CRS.`);
  const srs = spawnSync("gdalsrsinfo", ["-o", "proj4", file], { encoding: "utf8" });
  if (srs.status !== 0 || srs.stdout.trim() !== expected.crs.proj4) fail(`${basename(file)} CRS differs from the required VLCE2 grid.`);
}

export async function readbackV21RasterFirst(dataRootArg, outputArg) {
  const dataRoot = resolve(dataRootArg); const output = resolve(outputArg);
  if (dataRoot !== DATA_ROOT || output !== join(DATA_ROOT, "derived", BATCH)) fail("readback is limited to the approved local V2.1 batch directory.");
  if (await realpath(output) !== output) fail("output directory must not resolve through a symlink.");
  const rootLink = await lstat(output); if (!rootLink.isDirectory() || rootLink.isSymbolicLink()) fail("output directory is not a real directory.");
  exact((await readdir(output)).sort(), ["forest-mask-snapshot-1984.tif", "forest-mask-snapshot-1988.tif", "forest-mask-snapshot-1992.tif", "forest-mask-snapshot-1996.tif", "forest-mask-snapshot-2000.tif", "forest-mask-snapshot-2004.tif", "forest-mask-snapshot-2008.tif", "forest-mask-snapshot-2012.tif", "forest-mask-snapshot-2016.tif", "forest-mask-snapshot-2020.tif", "forest-mask-snapshot-2022.tif", "lineage.json", "sidecars", "whole-interval-loss-1984-1988.tif", "whole-interval-loss-1988-1992.tif", "whole-interval-loss-1992-1996.tif", "whole-interval-loss-1996-2000.tif", "whole-interval-loss-2000-2004.tif", "whole-interval-loss-2004-2008.tif", "whole-interval-loss-2008-2012.tif", "whole-interval-loss-2012-2016.tif", "whole-interval-loss-2016-2020.tif", "whole-interval-loss-2020-2022.tif"].sort(), "output directory entries");
  const lineageFile = join(output, "lineage.json"); const lineage = await json(lineageFile); const { snapshots, intervals } = validateV21LineageShape(lineage);
  const expected = (await json(gridPath)).grid; const codeProvenance = { runnerSha256: await sha(runnerPath), workerSha256: await sha(workerPath) };
  const records = [];
  for (const row of [...snapshots, ...intervals]) {
    const raster = join(output, row.output.path); const sidecarFile = join(output, row.sidecar);
    for (const file of [raster, sidecarFile]) { const link = await lstat(file); if (!link.isFile() || link.isSymbolicLink()) fail(`${basename(file)} must be a regular non-symlink file.`); }
    if ((await stat(raster)).size !== row.output.byteLength || await sha(raster) !== row.output.sha256) fail(`raster bytes do not match lineage for ${row.output.path}.`);
    const sidecar = await json(sidecarFile); exact(sidecar, Object.fromEntries(Object.entries(row).filter(([key]) => key !== "sidecar")), `sidecar ${row.sidecar}`);
    exact(sidecar.codeProvenance, codeProvenance, `code provenance for ${row.output.path}`);
    observedGdal(raster, expected);
    for (const input of row.inputs) { if ((await stat(input.path)).size !== input.byteLength || await sha(input.path) !== input.sha256) fail(`annual input bytes changed: ${basename(input.path)}.`); }
    records.push({ kind: row.kind, ...(row.kind === "forest-mask-snapshot" ? { year: row.year } : { fromYear: row.fromYear, toYear: row.toYear }), raster: { path: row.output.path, byteLength: row.output.byteLength, sha256: row.output.sha256 }, sidecar: { path: row.sidecar, byteLength: (await stat(sidecarFile)).size, sha256: await sha(sidecarFile) }, inputCount: row.inputs.length, telemetry: { elapsedSeconds: row.telemetry.elapsedSeconds, peakRssBytes: row.telemetry.peakRssBytes, scratchDiskPeakBytes: row.telemetry.scratchDiskPeakBytes } });
  }
  return { schemaVersion: "witness-tree/phase2-v21-raster-readback-evidence/1", status: "local-readback-passed-nonproduction", batchId: BATCH, lineage: { path: "lineage.json", sha256: await sha(lineageFile), byteLength: (await stat(lineageFile)).size }, codeProvenance, counts: { snapshots: 11, intervals: 10, outputs: 21 }, outputs: records, claims: { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false, vectorsCreated: false }, redaction: "Absolute local paths and input paths are intentionally omitted from this repo evidence record." };
}

async function main() {
  const [, , flag, dataRoot, output] = process.argv;
  if (flag !== "--write-repo-evidence" || !dataRoot || !output) throw new Error("Usage: readback-phase2-v21-raster-first --write-repo-evidence <absolute-Witness_Tree-data> <approved-V2.1-output-directory>");
  const evidence = await readbackV21RasterFirst(dataRoot, output);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: evidence.status, outputCount: evidence.counts.outputs, evidencePath, productionEligible: false }, null, 2));
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
