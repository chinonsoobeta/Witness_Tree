import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
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
const METHOD_VERSION = "phase2-v21-whole-interval-raster-first/1";
const SIDECAR_SCHEMA = "witness-tree/phase2-v21-raster-sidecar/1";

function fail(message) {
  throw new Error(`V2.1 raster run stopped: ${message}`);
}

function requireExactKeys(value, expected, label) {
  const actual = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
  const wanted = [...expected].sort();
  try { assert.deepEqual(actual, wanted); } catch { fail(`${label} has unexpected or missing fields.`); }
}

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

function sidecarIdentity(preflight, kind, years, inputs) {
  return {
    schemaVersion: SIDECAR_SCHEMA,
    batchId: V21_BATCH,
    kind,
    ...years,
    inputs,
    ...preflight.grid,
    methodVersion: METHOD_VERSION,
    codeProvenance: preflight.codeProvenance,
    productionEligible: false,
    released: false,
  };
}

function sidecarFilename(record) {
  return `${record.kind}-${record.fromYear ?? record.year}-${record.toYear ?? "snapshot"}.json`;
}

async function writeSidecar(sidecars, record) {
  const filename = sidecarFilename(record);
  await writeFile(join(sidecars, filename), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  return `sidecars/${filename}`;
}

async function presentRegularFile(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) fail(`${file} must be a regular non-symlink file.`);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error?.message?.startsWith("V2.1 raster run stopped:")) throw error;
    fail(`cannot safely inspect ${file}: ${error?.message || error}`);
  }
}

async function presentDirectory(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`${directory} must be a real directory.`);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error?.message?.startsWith("V2.1 raster run stopped:")) throw error;
    fail(`cannot safely inspect ${directory}: ${error?.message || error}`);
  }
}

function validateFailureMarker(marker) {
  if (marker?.schemaVersion !== "witness-tree/phase2-v21-raster-first-failed-run/1" || marker.status !== "failed-not-evidence") {
    fail("existing RUN_FAILED_NON_EVIDENCE.json is not the runner's fail-closed marker.");
  }
  if (typeof marker.error !== "string" || marker.productionEligible !== false || marker.released !== false || marker.admitted !== false) {
    fail("existing RUN_FAILED_NON_EVIDENCE.json has unsafe claims.");
  }
}

async function readFailureMarker(output) {
  const markerPath = join(output, "RUN_FAILED_NON_EVIDENCE.json");
  if (!(await presentRegularFile(markerPath))) return false;
  let marker;
  try { marker = await json(markerPath); } catch { fail("existing RUN_FAILED_NON_EVIDENCE.json is unreadable."); }
  validateFailureMarker(marker);
  return true;
}

/**
 * Decides whether one already-present raster and sidecar are safe to resume.
 *
 * An absent pair is produced normally. A half-written pair, an identity
 * mismatch, or any byte drift stops the run without repair or deletion. A
 * matching pair is the only existing output that may be skipped.
 */
export async function resumeOutcome(plan, readSidecar, hashOutput, sizeOutput, present) {
  const [hasOutput, hasSidecar] = await Promise.all([present(plan.output), present(plan.sidecar)]);
  if (!hasOutput && !hasSidecar) return { action: "produce" };
  if (hasOutput !== hasSidecar) fail(`incomplete prior output for ${plan.relativeOutput}: ${hasOutput ? "the raster exists without its sidecar" : "the sidecar exists without its raster"}. Resolve this by hand; the runner will not repair or remove it.`);

  let sidecar;
  try { sidecar = await readSidecar(plan.sidecar); } catch { fail(`prior sidecar for ${plan.relativeOutput} is unreadable; resolve this by hand.`); }
  requireExactKeys(sidecar, [...Object.keys(plan.identity), "output", "telemetry"], `prior sidecar for ${plan.relativeOutput}`);
  requireExactKeys(sidecar.output, ["path", "byteLength", "sha256"], `prior sidecar output for ${plan.relativeOutput}`);
  requireExactKeys(sidecar.telemetry, ["elapsedSeconds", "peakRssBytes", "scratchDiskPeakBytes", "window", "outputGrid"], `prior sidecar telemetry for ${plan.relativeOutput}`);
  requireExactKeys(sidecar.telemetry.outputGrid, ["width", "height", "geotransform", "crs", "crsSha256", "crsProj4", "nodataValue", "dataType"], `prior sidecar output grid for ${plan.relativeOutput}`);
  for (const [field, expected] of Object.entries(plan.identity)) {
    try { assert.deepEqual(sidecar?.[field], expected); } catch { fail(`prior output ${plan.relativeOutput} has a different identity field: ${field}. Resolve this by hand.`); }
  }
  if (sidecar?.output?.path !== plan.relativeOutput) fail(`prior sidecar for ${plan.relativeOutput} records a different output path.`);
  if (!Number.isInteger(sidecar?.output?.byteLength) || sidecar.output.byteLength <= 0 || !/^[0-9a-f]{64}$/.test(sidecar.output.sha256 ?? "")) {
    fail(`prior sidecar for ${plan.relativeOutput} has invalid output byte identity.`);
  }
  try { assertObservedGrid(sidecar.telemetry, plan.identity); } catch { fail(`prior sidecar for ${plan.relativeOutput} has invalid worker-observed grid telemetry.`); }
  if (!(typeof sidecar.telemetry?.elapsedSeconds === "number" && Number.isFinite(sidecar.telemetry.elapsedSeconds) && sidecar.telemetry.elapsedSeconds > 0)) fail(`prior sidecar for ${plan.relativeOutput} has invalid elapsed telemetry.`);
  if (!(typeof sidecar.telemetry?.peakRssBytes === "number" && Number.isFinite(sidecar.telemetry.peakRssBytes) && sidecar.telemetry.peakRssBytes > 0)) fail(`prior sidecar for ${plan.relativeOutput} has invalid RSS telemetry.`);
  if (!(typeof sidecar.telemetry?.scratchDiskPeakBytes === "number" && Number.isFinite(sidecar.telemetry.scratchDiskPeakBytes) && sidecar.telemetry.scratchDiskPeakBytes >= 0)) fail(`prior sidecar for ${plan.relativeOutput} has invalid scratch telemetry.`);
  if (!Array.isArray(sidecar.telemetry?.window) || sidecar.telemetry.window.length !== 2 || sidecar.telemetry.window.some((value) => !Number.isInteger(value) || value <= 0)) fail(`prior sidecar for ${plan.relativeOutput} has invalid window telemetry.`);

  let actualByteLength;
  let actualSha256;
  try {
    actualByteLength = await sizeOutput(plan.output);
    actualSha256 = await hashOutput(plan.output);
  } catch { fail(`prior output ${plan.relativeOutput} cannot be read for identity verification; resolve this by hand.`); }
  if (actualByteLength !== sidecar.output.byteLength) fail(`prior output ${plan.relativeOutput} no longer matches its sidecar byte length.`);
  if (actualSha256 !== sidecar.output.sha256) fail(`prior output ${plan.relativeOutput} no longer matches its sidecar SHA-256.`);
  return { action: "skip", record: { ...sidecar, sidecar: plan.relativeSidecar }, sha256: actualSha256, byteLength: actualByteLength };
}

function productPlans(preflight, output) {
  const plans = [];
  for (const source of preflight.snapshots) {
    const relativeOutput = `forest-mask-snapshot-${source.year}.tif`;
    const identity = sidecarIdentity(preflight, "forest-mask-snapshot", { year: source.year }, [source]);
    plans.push({ mode: "snapshot", inputs: [source], identity, relativeOutput, relativeSidecar: `sidecars/${sidecarFilename(identity)}`, output: join(output, relativeOutput), sidecar: join(output, "sidecars", sidecarFilename(identity)) });
  }
  for (const interval of INTERVALS) {
    const inputs = preflight.losses.filter((row) => row.fromYear >= interval.fromYear && row.toYear <= interval.toYear);
    assert.equal(inputs.length, interval.toYear - interval.fromYear, "Every interval must use every adjacent annual loss raster.");
    const relativeOutput = `whole-interval-loss-${interval.fromYear}-${interval.toYear}.tif`;
    const identity = sidecarIdentity(preflight, "whole-interval-loss", interval, inputs);
    plans.push({ mode: "interval", inputs, identity, relativeOutput, relativeSidecar: `sidecars/${sidecarFilename(identity)}`, output: join(output, relativeOutput), sidecar: join(output, "sidecars", sidecarFilename(identity)) });
  }
  return plans;
}

async function existingOutputState(output, plans) {
  let outputInfo;
  try { outputInfo = await lstat(output); } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, actions: plans.map(() => ({ action: "produce" })) };
    fail(`cannot safely inspect output directory: ${error?.message || error}`);
  }
  if (!outputInfo.isDirectory() || outputInfo.isSymbolicLink()) fail("existing V2.1 output must be a real directory.");
  const entries = await readdir(output);
  if (entries.includes("lineage.json")) fail("refusing to resume a completed V2.1 output directory; lineage.json already exists.");
  const markerPresent = await readFailureMarker(output);
  const expectedOutputNames = new Set(plans.map((plan) => plan.relativeOutput));
  for (const entry of entries) {
    if (entry !== "sidecars" && entry !== "RUN_FAILED_NON_EVIDENCE.json" && !expectedOutputNames.has(entry)) fail(`existing V2.1 output contains an unexpected entry: ${entry}. Resolve this by hand.`);
  }
  if (!(await presentDirectory(join(output, "sidecars")))) fail("existing V2.1 output has no real sidecars directory.");
  const sidecarEntries = await readdir(join(output, "sidecars"));
  const expectedSidecarNames = new Set(plans.map((plan) => basename(plan.sidecar)));
  for (const entry of sidecarEntries) if (!expectedSidecarNames.has(entry)) fail(`existing V2.1 sidecars contains an unexpected entry: ${entry}. Resolve this by hand.`);

  const actions = [];
  let resumedCount = 0;
  for (const plan of plans) {
    const outcome = await resumeOutcome(plan, json, sha, async (file) => (await stat(file)).size, presentRegularFile);
    actions.push(outcome);
    if (outcome.action === "skip") resumedCount += 1;
  }
  if (resumedCount === 0) fail("existing V2.1 output has no identity-bound completed product to resume; resolve it by hand.");
  return { exists: true, actions, markerPresent };
}

async function removeFailureMarker(output) {
  const markerPath = join(output, "RUN_FAILED_NON_EVIDENCE.json");
  if (!(await presentRegularFile(markerPath))) return;
  await unlink(markerPath);
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

export async function runV21RasterFirst(dataRootArg, outputArg, { resume = false } = {}) {
  const dataRoot = resolve(dataRootArg), output = resolve(outputArg);
  const preflight = await preflightV21RasterFirst(dataRoot, output);
  if (!resume) {
    try { await lstat(output); throw new Error("Refusing to use an existing V2.1 output directory without --resume."); } catch (error) {
      if (error?.message === "Refusing to use an existing V2.1 output directory without --resume.") throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const sourcePreflight = await sourceBackedPhase2RealNationalPreflight(dataRoot);
  assert.equal(sourcePreflight.status, "ready-for-bounded-nonproduction-execution");
  const plans = productPlans(preflight, output);
  const state = resume ? await existingOutputState(output, plans) : { exists: false, actions: plans.map(() => ({ action: "produce" })), markerPresent: false };
  const started = new Date().toISOString(); const startedMs = Date.now();
  if (!state.exists) await mkdir(output, { recursive: false });
  try {
  const sidecars = join(output, "sidecars"); if (!state.exists) await mkdir(sidecars);
  const outputs = [];
  for (const [index, plan] of plans.entries()) {
    const outcome = state.actions[index];
    if (outcome.action === "skip") {
      outputs.push(outcome.record);
      continue;
    }
    const telemetry = runPython(plan.mode, plan.output, plan.inputs.map((input) => input.path));
    const details = await stat(plan.output);
    assertObservedGrid(telemetry, preflight.grid);
    const record = { ...plan.identity, output: { path: plan.relativeOutput, byteLength: details.size, sha256: await sha(plan.output) }, telemetry };
    outputs.push({ ...record, sidecar: await writeSidecar(sidecars, record) });
  }
  const completed = new Date().toISOString();
  const lineage = { schemaVersion: "witness-tree/phase2-v21-raster-first-lineage/1", batchId: V21_BATCH, status: "local-nonproduction-executed", sourcePreflight: { status: sourcePreflight.status, inputSetSha256: sourcePreflight.sourceVerification.inputSetSha256 }, preflight, execution: { started, completed, elapsedSeconds: (Date.now() - startedMs) / 1000, concurrency: 1, noPerCellPolygons: true }, outputs, claims: { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false } };
  if (state.markerPresent) await removeFailureMarker(output);
  await writeFile(join(output, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`, { flag: "wx" });
  return lineage;
  } catch (error) {
    await writeFile(join(output, "RUN_FAILED_NON_EVIDENCE.json"), `${JSON.stringify({ schemaVersion: "witness-tree/phase2-v21-raster-first-failed-run/1", status: "failed-not-evidence", error: error instanceof Error ? error.message : String(error), productionEligible: false, released: false, admitted: false }, null, 2)}\n`, { flag: "wx" }).catch(() => undefined);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const resume = args.includes("--resume");
  const positional = args.filter((arg) => arg !== "--resume");
  const [dataRoot, output] = positional;
  if (args.some((arg) => arg.startsWith("--") && arg !== "--resume") || !dataRoot || !output || positional.length !== 2) throw new Error("Usage: run-phase2-v21-raster-first [--resume] <absolute-Witness_Tree-data> <approved-absolute-derived-output-directory>");
  console.log(JSON.stringify(await runV21RasterFirst(dataRoot, output, { resume }), null, 2));
}
