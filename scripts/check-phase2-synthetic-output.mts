import { resolve } from "node:path";

import { readbackSyntheticBatchOutput, recomputeSyntheticBatchOutput } from "../lib/pipeline/synthetic-output-readback";

const [, , directoryArgument, manifestArgument, overlayArgument] = process.argv;
if (!directoryArgument || ([manifestArgument, overlayArgument].some(Boolean) && ![manifestArgument, overlayArgument].every(Boolean))) throw new Error("Usage: check-phase2-synthetic-output <output-directory> [manifest.json synthetic-overlay.json]");
const result = manifestArgument && overlayArgument
  ? await recomputeSyntheticBatchOutput(resolve(directoryArgument), resolve(manifestArgument), resolve(overlayArgument))
  : await readbackSyntheticBatchOutput(resolve(directoryArgument));
console.log(`Phase 2 synthetic output readback passed: batch=${result.lineage.batchId} events=${result.integration.events.length} aggregates=${result.integration.aggregates.length} productionEligible=false.`);
