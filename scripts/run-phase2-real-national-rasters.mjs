import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, isAbsolute, join, resolve } from "node:path";

import { validatePhase2RealDataOwnerDecision } from "./check-phase2-real-data-owner-decision.mjs";
import { preflightEvidenceSha256, sourceBackedPhase2RealNationalPreflight } from "./preflight-phase2-real-national-run.mjs";

const WINDOW_SCRIPT = new URL("./phase2_raster_window.py", import.meta.url).pathname;

const json = async (url) => JSON.parse(await readFile(url, "utf8"));
async function sha(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) { if (Date.now() >= executionDeadlineMs) throw new Error("Approved 96-hour whole-operation limit elapsed."); hash.update(chunk); } return hash.digest("hex"); }
let executionDeadlineMs = Infinity;
function run(command, args) { const timeout = Math.floor(executionDeadlineMs - Date.now()); if (timeout <= 0) throw new Error("Approved 96-hour execution cap elapsed."); const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }); if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`); }
function vsi(zip, member) { return `/vsizip/${zip}/${member}`; }

const [, , dataRootArg, outputArg] = process.argv;
if (!dataRootArg || !outputArg) throw new Error("Usage: run-phase2-real-national-rasters <absolute-Witness_Tree-data> <new-output-directory>");
const dataRoot = resolve(dataRootArg), output = resolve(outputArg);
if (!isAbsolute(dataRootArg) || basename(dataRoot) !== "Witness_Tree-data" || !isAbsolute(outputArg)) throw new Error("Data root and output must be explicit absolute paths.");
assert.equal(output, join(dataRoot, "derived/phase2-real-national-1984-2022-v1"), "Output must be the approved derived batch directory.");
const operationStartedMs=Date.now(), operationStartedAt=new Date(operationStartedMs).toISOString();
executionDeadlineMs=operationStartedMs+96*60*60*1000;
const preflight=await sourceBackedPhase2RealNationalPreflight(dataRoot);
assert.equal(preflight.status, "ready-for-bounded-nonproduction-execution");
if(Date.now()>=executionDeadlineMs) throw new Error("Approved 96-hour whole-operation limit elapsed during source verification.");
const [decision, method, prep, harvest, wildfire, storage] = await Promise.all([
  json(new URL("../data/phase2-real-data-owner-decision.json", import.meta.url)), json(new URL("../data/phase2-method-parameters.json", import.meta.url)),
  json(new URL("../data/vlce2-promotion-preparation.json", import.meta.url)), json(new URL("../data/nrcan-harvest-profile.json", import.meta.url)),
  json(new URL("../data/nrcan-wildfire-profile.json", import.meta.url)), json(new URL("../data/phase2-real-raster-storage-plan.json", import.meta.url)),
]);
validatePhase2RealDataOwnerDecision(decision, { requireApproval: true });
assert.equal(method.reviewStatus, "owner-approved-versioned-nonproduction");
assert.equal(method.methodVersion, "phase2-owner-approved-versioned-nonproduction-v1");
assert.equal(method.parameterSha256, "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa");
assert.deepEqual(method.parameters.mask.forestClassValues, [210, 220, 230]);
assert.equal(storage.bound.passes, true);
assert.equal(decision.computePlan.proposedHardCaps.elapsedHours,96);
await mkdir(output);
for (const name of ["masks", "loss", "disturbance"]) await mkdir(join(output, name));
const scratch = join(output, ".scratch");
await mkdir(scratch);

const outputs = [];
let previousRaster;
for (const entry of prep.entries) {
  const zip = join(dataRoot, "raw/nrcan-annual-land-cover-v2/2026-08-12", entry.originalFilename);
  const member = `CA_forest_VLCE2_${entry.year}.tif`;
  run("unzip", ["-qq", "-j", zip, member, "-d", scratch]);
  const raster = join(scratch, member);
  const target = join(output, "masks", `forest-mask-${entry.year}.tif`);
  if (!previousRaster) {
    run("python3", [WINDOW_SCRIPT, "mask", raster, target]);
  } else {
    const loss = join(output, "loss", `detected-forest-loss-${entry.year - 1}-${entry.year}.tif`);
    run("python3", [WINDOW_SCRIPT, "pair", previousRaster, loss, "--second", raster, "--mask-output", target]);
    outputs.push({ kind: "detected-forest-loss", fromYear: entry.year - 1, toYear: entry.year, path: `loss/${basename(loss)}`, byteLength: (await stat(loss)).size, sha256: await sha(loss) });
    await rm(previousRaster);
  }
  outputs.push({ kind: "forest-mask", year: entry.year, path: `masks/${basename(target)}`, byteLength: (await stat(target)).size, sha256: await sha(target) });
  previousRaster = raster;
}
if (previousRaster) await rm(previousRaster);
await rm(scratch, { recursive: true });
for (const [kind, profile, directory, member] of [
  ["recorded-harvest", harvest, "nrcan-ca-forest-harvest-1985-2022/2026-08-14", "CA_Forest_Harvest_1985-2022.tif"],
  ["wildfire", wildfire, "nrcan-ca-forest-wildfire-1985-2022/2026-08-14", "CA_Forest_Fire_1985-2022.tif"],
]) {
  const zip = join(dataRoot, "raw", directory, basename(profile.raw.localPath));
  const target = join(output, "disturbance", `${kind}-1985-2022.tif`);
  run("gdal_translate", ["-q", "-of", "GTiff", "-co", "TILED=YES", "-co", "BLOCKXSIZE=512", "-co", "BLOCKYSIZE=512", "-co", "COMPRESS=ZSTD", "-co", "ZSTD_LEVEL=9", "-co", "NUM_THREADS=1", vsi(zip, member), target]);
  outputs.push({ kind, fromYear: 1985, toYear: 2022, path: `disturbance/${basename(target)}`, byteLength: (await stat(target)).size, sha256: await sha(target), sourceSha256: profile.raw.sha256 });
}
outputs.sort((a, b) => a.path.localeCompare(b.path));
const operationCompletedMs=Date.now(), operationCompletedAt=new Date(operationCompletedMs).toISOString(), observedWholeOperationElapsedSeconds=Math.ceil((operationCompletedMs-operationStartedMs)/1000);
assert.ok(observedWholeOperationElapsedSeconds<96*60*60,"Approved 96-hour whole-operation limit elapsed.");
const lineage = {
  schemaVersion: "witness-tree/phase2-real-national-raster-lineage/1", batchId: "phase2-real-national-1984-2022-v1",
  status: "versioned-nonproduction", reviewStatus: "owner-approved-versioned-nonproduction", productionEligible: false,
  methodVersion: method.methodVersion, methodParameterSha256: method.parameterSha256, forestClassValues: [210, 220, 230], excludedClassValues: [81],
  years: { first: 1984, last: 2022, count: 39 }, outputs, externalStorage: false, released: false,
  sourceVerification: preflight.sourceVerification,
  preflight: {sha256:preflightEvidenceSha256(preflight),status:preflight.status,capturedAt:preflight.capturedAt,digestScope:"canonical-source-backed-preflight-core"},
  execution: {operationStartedAt,operationCompletedAt,observedWholeOperationElapsedSeconds,wholeOperationElapsedMeasured:true,approvedElapsedHourLimit:96,approvedVcpuLimit:8,approvedRamLimitBytes:17179869184,approvedDiskLimitBytes:2199023255552,algorithmicChildProcessUpperBound:1,algorithmicWindowWidth:2048,algorithmicWindowHeight:2048,observedConcurrencyMeasured:false,observedVcpuUseMeasured:false,peakRssMeasured:false,scratchDiskPeakMeasured:false,retainedOutputBoundBytes:storage.bound.retainedOutputBoundBytes},
  limitations: ["No patch vectorization or normalized events.","No boundary intersections or aggregates.","No tiles, samples, or output statistics.","CPU utilization, peak RSS, actual concurrent-process peak, and scratch-disk peak are not instrumented; approved limits are configuration, not observed usage."],
};
await writeFile(join(output, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output, outputCount: outputs.length, totalBytes: outputs.reduce((sum, row) => sum + row.byteLength, 0), lineageSha256: await sha(join(output, "lineage.json")) }));
