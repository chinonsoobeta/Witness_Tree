import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveDataRoot } from "./data-root.mjs";

export const CANONICAL_REAL_EXECUTION = Object.freeze({
  batchId: "phase2-real-national-1984-2022-v1",
  lineageSha256: "a43e2bf03b5318c9163b84b4ea0edba3a1da08b8a28b4139d0da7698221779a0",
  inputSetSha256: "a69a86d6098cc9d06c102cf1574c6f57cc781617d8c441970903ea529b2b806c",
  preflightSha256: "7e4537e5c15809337d5a370a0413e51865cc3e62ec42357444aa11c1a8f8b840",
  executionEvidenceCoreSha256: "4f8c186839bf92ffa9adec074027d0f324decb9255dbd881fac96466772e4b31",
  methodVersion: "phase2-owner-approved-versioned-nonproduction-v1",
  methodParameterSha256: "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa",
  limitations: [
    "No patch vectorization or normalized events.",
    "No boundary intersections or aggregates.",
    "No tiles, samples, or output statistics.",
    "Whole-operation elapsed time was not captured by the original runner; 10,355 seconds covers the raster-transform interval evidenced by output-directory timestamps.",
    "CPU utilization, peak RSS, actual concurrent-process peak, and scratch-disk peak were not instrumented; 8 vCPU, 16 GiB, and 2 TiB are approved configuration limits, not observed usage.",
    "The prospective runner starts its 96-hour deadline before source hashing and uses 2048x2048 windows and one synchronous child process.",
  ],
});

const SHA256 = /^[0-9a-f]{64}$/;
export function exactKeys(value, expected, label) { assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys changed.`); }
export function executionEvidenceCore(evidence) {
  return { batchId:evidence.batchId, methodVersion:evidence.methodVersion, methodParameterSha256:evidence.methodParameterSha256, inputSetSha256:evidence.inputSetSha256, rasterTransformStartedAt:evidence.execution.rasterTransformStartedAt, rasterTransformCompletedAt:evidence.execution.rasterTransformCompletedAt, observedRasterTransformElapsedSeconds:evidence.execution.observedRasterTransformElapsedSeconds, outputCount:evidence.counts.total, totalRasterBytes:evidence.totalRasterBytes, productionEligible:evidence.productionEligible };
}
export function expectedOutputPath(row) {
  if (row.kind === "forest-mask") return `masks/forest-mask-${row.year}.tif`;
  if (row.kind === "detected-forest-loss") return `loss/detected-forest-loss-${row.fromYear}-${row.toYear}.tif`;
  if (row.kind === "recorded-harvest") return "disturbance/recorded-harvest-1985-2022.tif";
  if (row.kind === "wildfire") return "disturbance/wildfire-1985-2022.tif";
  throw new Error(`Unsupported output kind: ${row.kind}`);
}
export function validateOutputIdentity(row, sourceById = new Map()) {
  const keys = row.kind === "forest-mask" ? ["kind","year","path","byteLength","sha256"] : row.kind === "detected-forest-loss" ? ["kind","fromYear","toYear","path","byteLength","sha256"] : ["kind","fromYear","toYear","path","byteLength","sha256","sourceSha256"];
  exactKeys(row, keys, `${row.kind} output`); assert.equal(row.path, expectedOutputPath(row)); assert.match(row.sha256, SHA256); assert.ok(Number.isSafeInteger(row.byteLength) && row.byteLength > 0);
  if (row.kind === "forest-mask") assert.ok(Number.isInteger(row.year) && row.year >= 1984 && row.year <= 2022);
  else { assert.ok(Number.isInteger(row.fromYear) && Number.isInteger(row.toYear)); if (row.kind === "detected-forest-loss") assert.equal(row.toYear,row.fromYear+1); }
  if (row.kind === "recorded-harvest" || row.kind === "wildfire") { assert.deepEqual([row.fromYear,row.toYear],[1985,2022]); const sourceId=row.kind === "recorded-harvest" ? "nrcan-harvest-1985-2022" : "nrcan-wildfire-1985-2022"; assert.equal(row.sourceSha256,sourceById.get(sourceId)?.sha256); }
  return row;
}
export function validateRealExecutionEvidence(evidence,lineageSummary){
  exactKeys(evidence,["batchId","boundaryAggregationPerformed","counts","execution","executionEvidenceCoreSha256","excludedClassValues","externalAction","forestClassValues","inputSetSha256","kinds","limitations","lineageSha256","methodParameterSha256","methodVersion","outputDirectory","preflightSha256","productionEligible","released","reviewStatus","schemaVersion","status","totalRasterBytes","years"],"execution evidence");
  exactKeys(evidence.execution,["algorithmicChildProcessUpperBound","algorithmicWindowHeight","algorithmicWindowWidth","approvedDiskLimitBytes","approvedElapsedHourLimit","approvedRamLimitBytes","approvedVcpuLimit","observedConcurrencyMeasured","observedRasterTransformElapsedSeconds","observedVcpuUseMeasured","peakRssMeasured","rasterTransformCompletedAt","rasterTransformStartedAt","retainedOutputBoundBytes","scratchDiskPeakMeasured","wholeOperationElapsedMeasured"],"execution telemetry");
  assert.equal(evidence.schemaVersion,"witness-tree/phase2-real-national-execution-evidence/2"); assert.equal(evidence.status,"readback-passed-versioned-nonproduction"); assert.equal(evidence.batchId,CANONICAL_REAL_EXECUTION.batchId); assert.equal(evidence.reviewStatus,"owner-approved-versioned-nonproduction");
  assert.equal(evidence.outputDirectory,"../Witness_Tree-data/derived/phase2-real-national-1984-2022-v1"); assert.deepEqual(evidence.counts,{forestMasks:39,annualLossRasters:38,disturbanceRasters:2,total:79}); assert.deepEqual(evidence.years,{first:1984,last:2022,count:39,lossPairs:38}); assert.deepEqual(evidence.kinds,["forest-mask","detected-forest-loss","recorded-harvest","wildfire"]); assert.equal(evidence.totalRasterBytes,23141889028);
  assert.equal(evidence.lineageSha256,CANONICAL_REAL_EXECUTION.lineageSha256); assert.equal(evidence.inputSetSha256,CANONICAL_REAL_EXECUTION.inputSetSha256); assert.equal(evidence.preflightSha256,CANONICAL_REAL_EXECUTION.preflightSha256); assert.equal(evidence.executionEvidenceCoreSha256,CANONICAL_REAL_EXECUTION.executionEvidenceCoreSha256); assert.equal(evidence.methodVersion,CANONICAL_REAL_EXECUTION.methodVersion); assert.equal(evidence.methodParameterSha256,CANONICAL_REAL_EXECUTION.methodParameterSha256); assert.deepEqual(evidence.forestClassValues,[210,220,230]); assert.deepEqual(evidence.excludedClassValues,[81]); assert.deepEqual(evidence.limitations,CANONICAL_REAL_EXECUTION.limitations);
  assert.equal(evidence.inputSetSha256,lineageSummary.inputSetSha256); assert.equal(evidence.preflightSha256,lineageSummary.preflightSha256); assert.equal(evidence.executionEvidenceCoreSha256,lineageSummary.executionEvidenceCoreSha256); assert.equal(evidence.lineageSha256,lineageSummary.lineageSha256);
  assert.equal(createHash("sha256").update(`${JSON.stringify(executionEvidenceCore(evidence))}\n`).digest("hex"),evidence.executionEvidenceCoreSha256);
  assert.equal(evidence.execution.rasterTransformStartedAt,"2026-08-21T22:20:35.720Z"); assert.equal(evidence.execution.rasterTransformCompletedAt,"2026-08-22T01:13:10.372Z"); assert.equal(evidence.execution.observedRasterTransformElapsedSeconds,10355); assert.equal(evidence.execution.wholeOperationElapsedMeasured,false); assert.equal(evidence.execution.approvedElapsedHourLimit,96); assert.equal(evidence.execution.approvedVcpuLimit,8); assert.equal(evidence.execution.approvedRamLimitBytes,17179869184); assert.equal(evidence.execution.approvedDiskLimitBytes,2199023255552); assert.equal(evidence.execution.algorithmicChildProcessUpperBound,1); assert.deepEqual([evidence.execution.algorithmicWindowWidth,evidence.execution.algorithmicWindowHeight],[2048,2048]); assert.equal(evidence.execution.observedConcurrencyMeasured,false); assert.equal(evidence.execution.observedVcpuUseMeasured,false); assert.equal(evidence.execution.peakRssMeasured,false); assert.equal(evidence.execution.scratchDiskPeakMeasured,false); assert.equal(evidence.execution.retainedOutputBoundBytes,237820018840);
  assert.equal(evidence.boundaryAggregationPerformed,false); assert.equal(evidence.released,false); assert.equal(evidence.productionEligible,false); assert.equal(evidence.externalAction,false); assert.doesNotMatch(JSON.stringify(evidence),/productionEligible"\s*:\s*true|"released"\s*:\s*true/i);
  return evidence;
}
export async function check(){const evidence=JSON.parse(await readFile(new URL("../data/phase2-real-national-execution-evidence.json",import.meta.url),"utf8"));const lineageFile=resolve(resolveDataRoot(),"derived/phase2-real-national-1984-2022-v1/lineage.json");const lineageBytes=await readFile(lineageFile);const lineage=JSON.parse(lineageBytes);validateRealExecutionEvidence(evidence,{lineageSha256:createHash("sha256").update(lineageBytes).digest("hex"),inputSetSha256:lineage.sourceVerification.inputSetSha256,preflightSha256:lineage.preflight.sha256,executionEvidenceCoreSha256:lineage.execution.executionEvidenceCoreSha256});}
if(import.meta.url===`file://${process.argv[1]}`){await check();console.log("Phase 2 real execution evidence passed.");}
