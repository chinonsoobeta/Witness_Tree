import { resolve } from "node:path";

import { readbackSyntheticBatchOutput } from "../lib/pipeline/synthetic-output-readback";

const [, , directoryArgument] = process.argv;
if (!directoryArgument) throw new Error("Usage: check-phase2-synthetic-output <output-directory>");
const result = await readbackSyntheticBatchOutput(resolve(directoryArgument));
console.log(`Phase 2 synthetic output readback passed: batch=${result.lineage.batchId} events=${result.integration.events.length} aggregates=${result.integration.aggregates.length} productionEligible=false.`);
