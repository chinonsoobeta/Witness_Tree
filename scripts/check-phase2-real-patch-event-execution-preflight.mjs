import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const CAP_BYTES = 2 * 1024 ** 4;
const MAX_SECONDS = 96 * 60 * 60;
const MAX_VCPU = 8;
const MAX_MEMORY_BYTES = 16 * 1024 ** 3;
const CHUNK_MEMORY_BYTES = 1024 ** 3;
const MAX_EVENT_BYTES_PER_CELL = 512;
const MAX_FIXED_BYTES_PER_EVENT = 4096;
const MAX_SCRATCH_BYTES_PER_RUN = 64;
const SUMMARY_SHA256 = "0296e433ca9fcca89c5ca64ad63b96b8ae39be8880372711d5fefa9c852d14c0";
const METHOD_SHA256 = "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const ceilDiv = (left, right) => Math.ceil(left / right);

export function expectedPatchEventPreflight(summary) {
  const outputBoundBytes = summary.lossCellCount * MAX_EVENT_BYTES_PER_CELL
    + summary.connectedComponentCount * MAX_FIXED_BYTES_PER_EVENT;
  const scratchBoundBytes = summary.runRecordCount * MAX_SCRATCH_BYTES_PER_RUN;
  const totalStorageBoundBytes = summary.retainedOutputBytes + outputBoundBytes + scratchBoundBytes;
  return {
    schemaVersion: "witness-tree/phase2-real-patch-event-execution-preflight/1",
    status: "storage-preflight-passed-runtime-pilot-required",
    sourceBatchId: summary.sourceBatchId,
    componentInventorySummarySha256: SUMMARY_SHA256,
    methodVersion: "phase2-owner-approved-versioned-nonproduction-v1",
    methodParameterSha256: METHOD_SHA256,
    exactInputTotals: {
      pairCount: summary.completedPairCount,
      lossCellCount: summary.lossCellCount,
      connectedComponentCount: summary.connectedComponentCount,
      runRecordCount: summary.runRecordCount,
      aliasRecordCount: summary.aliasRecordCount,
      retainedInputBytes: summary.retainedOutputBytes,
    },
    exactMethod: {
      aliasResolution: "first-pass-per-pair-source-to-final-root-map",
      sortableRunRecord: "little-endian-u64-root-u32-row-u32-x0-u32-x1",
      sortableRunRecordBytes: 20,
      externalSortKey: ["finalRoot", "row", "x0", "x1"],
      sortChunkMemoryBytes: CHUNK_MEMORY_BYTES,
      merge: "bounded-k-way-by-final-root",
      geometry: "one-unsimplified-30m-cell-polygon-per-loss-cell",
      eventContract: "realDetectedChangeEvent-equivalent",
      finalization: "partial-file-fsync-atomic-unused-name-directory-fsync",
    },
    storagePreflight: {
      maximumEventBytesPerCell: MAX_EVENT_BYTES_PER_CELL,
      maximumFixedBytesPerEvent: MAX_FIXED_BYTES_PER_EVENT,
      maximumScratchBytesPerRun: MAX_SCRATCH_BYTES_PER_RUN,
      retainedInputBytes: summary.retainedOutputBytes,
      outputBoundBytes,
      scratchBoundBytes,
      totalStorageBoundBytes,
      approvedStorageCapBytes: CAP_BYTES,
      headroomBytes: CAP_BYTES - totalStorageBoundBytes,
      passes: totalStorageBoundBytes <= CAP_BYTES,
    },
    runtimePreflight: {
      approvedMaxSeconds: MAX_SECONDS,
      maximumVcpu: MAX_VCPU,
      maximumMemoryBytes: MAX_MEMORY_BYTES,
      requiredSustainedCellsPerSecond: ceilDiv(summary.lossCellCount, MAX_SECONDS),
      requiredSustainedEventsPerSecond: ceilDiv(summary.connectedComponentCount, MAX_SECONDS),
      requiredSustainedOutputBytesPerSecond: ceilDiv(outputBoundBytes, MAX_SECONDS),
      measuredPilot: null,
      passes: false,
    },
    boundedPilot: {
      pair: [1984, 1985],
      maximumFinalizedComponents: 10000,
      maximumOutputBytes: 67108864,
      maximumScratchBytes: 2147483648,
      maximumSeconds: 1800,
      publicationOnLimit: "partial-only",
    },
    nationalExecutionAdmitted: false,
    released: false,
    productionEligible: false,
  };
}

export function validatePatchEventPreflight(record, summary) {
  assert.deepEqual(record, expectedPatchEventPreflight(summary));
  assert.equal(record.storagePreflight.passes, true);
  assert.ok(record.storagePreflight.headroomBytes > 0);
  assert.equal(record.runtimePreflight.passes, false);
  assert.equal(record.runtimePreflight.measuredPilot, null);
  assert.equal(record.nationalExecutionAdmitted, false);
  assert.equal(record.released, false);
  assert.equal(record.productionEligible, false);
  return record;
}

if (process.argv[1]?.endsWith("check-phase2-real-patch-event-execution-preflight.mjs")) {
  const summaryBytes = await readFile(new URL("../data/phase2-real-loss-component-inventory-summary.json", import.meta.url));
  assert.equal(sha256(summaryBytes), SUMMARY_SHA256);
  const summary = JSON.parse(summaryBytes);
  const record = JSON.parse(await readFile(new URL("../data/phase2-real-patch-event-execution-preflight.json", import.meta.url), "utf8"));
  validatePatchEventPreflight(record, summary);
  console.log("Phase 2 patch-event storage bound passed; bounded runtime pilot remains required.");
}
