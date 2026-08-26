import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { exactKeys, validateOutputIdentity, validateRealExecutionEvidence } from "./check-phase2-real-national-execution-evidence.mjs";

async function sha(file) { const h = createHash("sha256"); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest("hex"); }
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: readback-phase2-real-national <output-directory>");
const lineageFile = join(root, "lineage.json");
const lineage = JSON.parse(await readFile(lineageFile, "utf8"));
const evidence = JSON.parse(await readFile(new URL("../data/phase2-real-national-execution-evidence.json", import.meta.url), "utf8"));
const lineageSha256=await sha(lineageFile);
validateRealExecutionEvidence(evidence,{lineageSha256,inputSetSha256:lineage.sourceVerification.inputSetSha256,preflightSha256:lineage.preflight.sha256,executionEvidenceCoreSha256:lineage.execution.executionEvidenceCoreSha256});
const expectedRoot = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/phase2-real-national-1984-2022-v1";
assert.equal(root,expectedRoot);
assert.equal(await realpath(root), await realpath(expectedRoot));
const rootLink=await lstat(root); assert.equal(rootLink.isDirectory(),true); assert.equal(rootLink.isSymbolicLink(),false);
assert.deepEqual((await readdir(root)).sort(),["disturbance","lineage.json","loss","masks"]);
for(const dir of ["masks","loss","disturbance"]){const link=await lstat(join(root,dir));assert.equal(link.isDirectory(),true);assert.equal(link.isSymbolicLink(),false);}
exactKeys(lineage,["batchId","excludedClassValues","execution","externalStorage","forestClassValues","limitations","methodParameterSha256","methodVersion","outputs","preflight","productionEligible","released","reviewStatus","schemaVersion","sourceVerification","status","years"],"lineage");
exactKeys(lineage.years,["count","first","last"],"lineage years");
exactKeys(lineage.sourceVerification,["inputSetSha256","inputs","mode","totalVerifiedBytes","verifiedInputCount"],"source verification");
exactKeys(lineage.preflight,["capturedAt","digestScope","sha256","status"],"lineage preflight");
exactKeys(lineage.execution,["algorithmicChildProcessUpperBound","algorithmicWindowHeight","algorithmicWindowWidth","approvedDiskLimitBytes","approvedElapsedHourLimit","approvedRamLimitBytes","approvedVcpuLimit","batchId","executionEvidenceCoreSha256","inputSetSha256","methodParameterSha256","methodVersion","observedConcurrencyMeasured","observedRasterTransformElapsedSeconds","observedVcpuUseMeasured","outputCount","peakRssMeasured","productionEligible","rasterTransformCompletedAt","rasterTransformStartedAt","retainedOutputBoundBytes","scratchDiskPeakMeasured","totalRasterBytes","wholeOperationElapsedMeasured"],"lineage execution");
assert.equal(lineage.schemaVersion,"witness-tree/phase2-real-national-raster-lineage/1"); assert.equal(lineage.batchId,"phase2-real-national-1984-2022-v1"); assert.equal(lineage.reviewStatus,"owner-approved-versioned-nonproduction"); assert.deepEqual(lineage.years,{first:1984,last:2022,count:39}); assert.equal(lineage.externalStorage,false); assert.equal(lineage.released,false); assert.equal(lineage.preflight.status,"ready-for-bounded-nonproduction-execution"); assert.equal(lineage.preflight.digestScope,"canonical-source-backed-preflight-core"); assert.equal(lineage.sourceVerification.mode,"local-source-backed-full-byte-sha256");
for(const [key,value] of Object.entries(evidence.execution))assert.deepEqual(lineage.execution[key],value,`lineage execution ${key} changed`); assert.equal(lineage.execution.batchId,evidence.batchId); assert.equal(lineage.execution.methodVersion,evidence.methodVersion); assert.equal(lineage.execution.methodParameterSha256,evidence.methodParameterSha256); assert.equal(lineage.execution.inputSetSha256,evidence.inputSetSha256); assert.equal(lineage.execution.outputCount,evidence.counts.total); assert.equal(lineage.execution.totalRasterBytes,evidence.totalRasterBytes); assert.equal(lineage.execution.productionEligible,false);
for(const row of lineage.sourceVerification.inputs){exactKeys(row,["byteLength","fileName","id","sha256"],`source ${row.id}`);assert.match(row.sha256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(row.byteLength)&&row.byteLength>0);}
const sourceById=new Map(lineage.sourceVerification.inputs.map(row=>[row.id,row]));assert.equal(sourceById.size,41);
for(const row of lineage.outputs)validateOutputIdentity(row,sourceById);
assert.deepEqual(Object.keys(evidence).sort(), ["batchId","boundaryAggregationPerformed","counts","execution","executionEvidenceCoreSha256","excludedClassValues","externalAction","forestClassValues","inputSetSha256","kinds","limitations","lineageSha256","methodParameterSha256","methodVersion","outputDirectory","preflightSha256","productionEligible","released","reviewStatus","schemaVersion","status","totalRasterBytes","years"].sort());
assert.equal(evidence.schemaVersion,"witness-tree/phase2-real-national-execution-evidence/2"); assert.equal(evidence.batchId,lineage.batchId); assert.equal(evidence.reviewStatus,lineage.reviewStatus);
assert.deepEqual(evidence.counts,{forestMasks:39,annualLossRasters:38,disturbanceRasters:2,total:79}); assert.deepEqual(evidence.years,{first:1984,last:2022,count:39,lossPairs:38}); assert.deepEqual(evidence.kinds,["forest-mask","detected-forest-loss","recorded-harvest","wildfire"]);
assert.equal(evidence.lineageSha256,lineageSha256); assert.equal(evidence.preflightSha256,lineage.preflight.sha256); assert.equal(evidence.executionEvidenceCoreSha256,lineage.execution.executionEvidenceCoreSha256); assert.equal(evidence.inputSetSha256,lineage.sourceVerification.inputSetSha256);
assert.equal(evidence.boundaryAggregationPerformed,false); assert.equal(evidence.released,false); assert.equal(evidence.productionEligible,false); assert.equal(evidence.externalAction,false);
assert.equal(lineage.status, "versioned-nonproduction"); assert.equal(lineage.productionEligible, false); assert.deepEqual(lineage.forestClassValues, [210,220,230]); assert.deepEqual(lineage.excludedClassValues, [81]);
assert.equal(lineage.outputs.length, 79); assert.equal(new Set(lineage.outputs.map((x) => x.path)).size, 79);
assert.equal(lineage.methodVersion,evidence.methodVersion); assert.equal(lineage.methodParameterSha256,evidence.methodParameterSha256); assert.deepEqual(lineage.forestClassValues,[210,220,230]); assert.deepEqual(lineage.excludedClassValues,[81]);
assert.equal(lineage.sourceVerification.inputs.length,41); assert.equal(lineage.sourceVerification.verifiedInputCount,41); assert.equal(lineage.sourceVerification.totalVerifiedBytes,59455004710);
assert.equal(createHash("sha256").update(JSON.stringify(lineage.sourceVerification.inputs)).digest("hex"),lineage.sourceVerification.inputSetSha256);
assert.deepEqual(lineage.limitations,evidence.limitations);
assert.deepEqual(lineage.outputs.filter((x)=>x.kind==="forest-mask").map((x)=>x.year),Array.from({length:39},(_,i)=>1984+i));
assert.deepEqual(lineage.outputs.filter((x)=>x.kind==="detected-forest-loss").map((x)=>[x.fromYear,x.toYear]),Array.from({length:38},(_,i)=>[1984+i,1985+i]));
assert.deepEqual(lineage.outputs.filter((x)=>x.kind==="recorded-harvest"||x.kind==="wildfire").map((x)=>x.kind).sort(),["recorded-harvest","wildfire"]);
const actual = [];
for (const dir of ["masks","loss","disturbance"]) for (const name of await readdir(join(root, dir))) actual.push(`${dir}/${name}`);
assert.deepEqual(actual.sort(), lineage.outputs.map((x) => x.path).sort());
for (const row of lineage.outputs) {
  const file = join(root, row.path); const link = await lstat(file); assert.equal(link.isFile(),true); assert.equal(link.isSymbolicLink(),false); assert.equal((await stat(file)).size, row.byteLength); assert.equal(await sha(file), row.sha256);
  const info = spawnSync("gdalinfo", ["-json", file], { encoding:"utf8" }); assert.equal(info.status, 0, info.stderr);
  const parsed = JSON.parse(info.stdout); assert.deepEqual(parsed.size, [193936,128340]); assert.deepEqual(parsed.geoTransform.map((x)=>Math.round(x*1e6)/1e6),[-2660910.524,30,0,2998848.1105,0,-30]); assert.equal(createHash("sha256").update(`${parsed.coordinateSystem.wkt}\n`).digest("hex"),"221435cb5f13c37ec9936a21dc113d2184e3f5fcb1e4eb1a21b891e39cfd6882"); assert.equal(parsed.bands.length, 1); assert.deepEqual(parsed.bands[0].block,[512,512]);
  if (row.kind === "forest-mask" || row.kind === "detected-forest-loss") { assert.equal(parsed.bands[0].type, "Byte"); assert.equal(parsed.bands[0].noDataValue, 255); assert.equal(parsed.metadata.IMAGE_STRUCTURE.COMPRESSION,"LZW"); }
  else { assert.equal(parsed.bands[0].type, "UInt16"); assert.equal(parsed.bands[0].noDataValue,65536); assert.equal(parsed.metadata.IMAGE_STRUCTURE.COMPRESSION,"ZSTD"); }
}
console.log(JSON.stringify({status:"readback-passed",outputCount:79,totalBytes:lineage.outputs.reduce((s,x)=>s+x.byteLength,0),lineageSha256,productionEligible:false}));
