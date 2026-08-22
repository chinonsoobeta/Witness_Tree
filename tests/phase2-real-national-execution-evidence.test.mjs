import assert from "node:assert/strict";import test from "node:test";import {readFile} from "node:fs/promises";import {validateRealExecutionEvidence} from "../scripts/check-phase2-real-national-execution-evidence.mjs";
const evidence=JSON.parse(await readFile(new URL("../data/phase2-real-national-execution-evidence.json",import.meta.url),"utf8"));
const lineage={sourceVerification:{inputSetSha256:evidence.inputSetSha256},preflight:{sha256:evidence.preflightSha256},execution:{executionEvidenceCoreSha256:evidence.executionEvidenceCoreSha256}};
test("canonical real execution evidence is bounded and non-production",()=>assert.equal(validateRealExecutionEvidence(structuredClone(evidence),lineage).counts.total,79));
for(const [name,mutate] of [
  ["kind",x=>x.kinds[0]="other"],["year",x=>x.years.last=2023],["source",x=>x.inputSetSha256="0".repeat(64)],["path",x=>x.outputDirectory="../raw"],["status",x=>x.productionEligible=true],["method",x=>x.methodParameterSha256="0".repeat(64)],
  ["schema key",x=>x.unexpected=true],["batch",x=>x.batchId="other"],["review",x=>x.reviewStatus="production"],["classes",x=>x.forestClassValues=[81,210,220,230]],["count",x=>x.counts.total=78],
  ["elapsed",x=>x.execution.elapsedSeconds=96*3600],["concurrency",x=>x.execution.observedConcurrencyUpperBound=9],["memory cap",x=>x.execution.ramCapBytes+=1],["disk cap",x=>x.execution.diskCapBytes+=1],
]) test(`rejects coordinated ${name} tamper`,()=>{const x=structuredClone(evidence);mutate(x);assert.throws(()=>validateRealExecutionEvidence(x,lineage));});
