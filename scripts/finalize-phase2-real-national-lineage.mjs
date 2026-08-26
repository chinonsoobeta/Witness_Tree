import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preflightEvidenceSha256, sourceBackedPhase2RealNationalPreflight } from "./preflight-phase2-real-national-run.mjs";
import { executionEvidenceCore } from "./check-phase2-real-national-execution-evidence.mjs";

const dataRoot = resolve(process.argv[2] ?? "");
const output = join(dataRoot, "derived/phase2-real-national-1984-2022-v1");
const lineageFile = join(output, "lineage.json");
const lineage = JSON.parse(await readFile(lineageFile, "utf8"));
const evidence = JSON.parse(await readFile(new URL("../data/phase2-real-national-execution-evidence.json", import.meta.url), "utf8"));
const preflight = await sourceBackedPhase2RealNationalPreflight(dataRoot);
if (preflight.status !== "ready-for-bounded-nonproduction-execution") throw new Error("Source-backed preflight is not ready.");
if (evidence.batchId !== lineage.batchId) throw new Error("Execution evidence batch does not match lineage.");
const executionCore = executionEvidenceCore(evidence);
const digest = (value) => createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
Object.assign(lineage, {
  sourceVerification: { mode: preflight.sourceVerification.mode, verifiedInputCount: 41, totalVerifiedBytes: preflight.sourceVerification.totalVerifiedBytes, inputSetSha256: preflight.sourceVerification.inputSetSha256, inputs: preflight.sourceVerification.inputs },
  preflight: { sha256: preflightEvidenceSha256(preflight), status: preflight.status, capturedAt: preflight.capturedAt, digestScope: "canonical-source-backed-preflight-core" },
  execution: { ...executionCore, executionEvidenceCoreSha256: digest(executionCore), ...evidence.execution },
  limitations: evidence.limitations
});
await writeFile(lineageFile, `${JSON.stringify(lineage, null, 2)}\n`);
console.log(JSON.stringify({lineageFile, executionEvidenceCoreSha256: lineage.execution.executionEvidenceCoreSha256, observedRasterTransformElapsedSeconds:evidence.execution.observedRasterTransformElapsedSeconds}));
