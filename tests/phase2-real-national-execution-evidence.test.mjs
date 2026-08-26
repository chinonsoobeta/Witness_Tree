import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { exactKeys, validateOutputIdentity, validateRealExecutionEvidence } from "../scripts/check-phase2-real-national-execution-evidence.mjs";

const evidence=JSON.parse(await readFile(new URL("../data/phase2-real-national-execution-evidence.json",import.meta.url),"utf8"));
const lineageSummary={lineageSha256:"a43e2bf03b5318c9163b84b4ea0edba3a1da08b8a28b4139d0da7698221779a0",inputSetSha256:"a69a86d6098cc9d06c102cf1574c6f57cc781617d8c441970903ea529b2b806c",preflightSha256:"7e4537e5c15809337d5a370a0413e51865cc3e62ec42357444aa11c1a8f8b840",executionEvidenceCoreSha256:"4f8c186839bf92ffa9adec074027d0f324decb9255dbd881fac96466772e4b31"};
test("canonical real execution evidence is independently digest-bound and non-production",()=>assert.equal(validateRealExecutionEvidence(structuredClone(evidence),structuredClone(lineageSummary)).counts.total,79));

for(const [name,mutate] of [
  ["kind",x=>x.kinds[0]="other"],["year",x=>x.years.last=2023],["source",x=>x.inputSetSha256="0".repeat(64)],["path",x=>x.outputDirectory="../raw"],["production",x=>x.productionEligible=true],["release",x=>x.released=true],["production text",x=>x.limitations[0]="Released for production."],["method",x=>x.methodParameterSha256="0".repeat(64)],
  ["schema key",x=>x.unexpected=true],["batch",x=>x.batchId="other"],["review",x=>x.reviewStatus="production"],["classes",x=>x.forestClassValues=[81,210,220,230]],["count",x=>x.counts.total=78],["limitations",x=>x.limitations.pop()],
  ["elapsed telemetry",x=>x.execution.observedRasterTransformElapsedSeconds=96*3600],["whole-operation claim",x=>x.execution.wholeOperationElapsedMeasured=true],["CPU observation claim",x=>x.execution.observedVcpuUseMeasured=true],["memory observation claim",x=>x.execution.peakRssMeasured=true],["disk observation claim",x=>x.execution.scratchDiskPeakMeasured=true],
]) test(`rejects ${name} tamper`,()=>{const x=structuredClone(evidence);mutate(x);assert.throws(()=>validateRealExecutionEvidence(x,structuredClone(lineageSummary)));});

test("rejects coordinated evidence and portable-summary digest tamper",()=>{const x=structuredClone(evidence),summary=structuredClone(lineageSummary);x.lineageSha256=summary.lineageSha256="0".repeat(64);assert.throws(()=>validateRealExecutionEvidence(x,summary));});
test("rejects a renamed output despite unchanged metadata",()=>assert.throws(()=>validateOutputIdentity({kind:"forest-mask",year:1984,path:"masks/renamed.tif",byteLength:1,sha256:"a".repeat(64)})));
test("rejects coordinated disturbance kind, path, and wrong source identity",()=>{const sources=new Map([["nrcan-wildfire-1985-2022",{sha256:"b".repeat(64)}]]);assert.throws(()=>validateOutputIdentity({kind:"wildfire",fromYear:1985,toYear:2022,path:"disturbance/wildfire-1985-2022.tif",byteLength:1,sha256:"c".repeat(64),sourceSha256:"a".repeat(64)},sources));});
test("rejects extra output and source claim fields",()=>{assert.throws(()=>validateOutputIdentity({kind:"forest-mask",year:1984,path:"masks/forest-mask-1984.tif",byteLength:1,sha256:"a".repeat(64),productionEligible:false}));assert.throws(()=>exactKeys({id:"vlce2-1984",fileName:"x",byteLength:1,sha256:"a".repeat(64),released:false},["id","fileName","byteLength","sha256"],"source"));});
test("the retained historical runner measures the whole operation around source hashing and output finalization", async () => {
  const runner = await readFile(new URL("../scripts/run-phase2-real-national-rasters.mjs", import.meta.url), "utf8");
  const started = runner.indexOf("operationStartedMs=Date.now()");
  const sourceHash = runner.indexOf("sourceBackedPhase2RealNationalPreflight(dataRoot)");
  const outputsFinalized = runner.indexOf("outputs.sort");
  const completed = runner.indexOf("operationCompletedMs=Date.now()");
  const lineageWrite = runner.indexOf("writeFile(join(output, \"lineage.json\")");
  assert.ok(started >= 0 && started < sourceHash);
  assert.ok(sourceHash < outputsFinalized && outputsFinalized < completed && completed < lineageWrite);
});
