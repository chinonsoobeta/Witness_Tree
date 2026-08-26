import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sum = (rows, select) => rows.reduce((total, row) => total + select(row), 0);

export function validateComponentInventoryEvidence(record, sourceMap, summary) {
  assert.deepEqual(Object.keys(summary), [
    "schemaVersion", "evidence", "sourceMap", "sourceBatchId", "canonicalPairCount",
    "completedPairCount", "componentLineageBytes", "retainedOutputBytes", "lossCellCount",
    "connectedComponentCount", "runRecordCount", "aliasRecordCount", "released",
    "productionEligible",
  ]);
  assert.equal(summary.schemaVersion, "witness-tree/phase2-real-loss-component-inventory-summary/1");
  assert.deepEqual(summary.evidence, {
    fileName: "phase2-real-loss-component-inventory-readback.json",
    byteLength: summary.evidence.byteLength,
    sha256: summary.evidence.sha256,
  });
  assert.ok(Number.isSafeInteger(summary.evidence.byteLength) && summary.evidence.byteLength > 0);
  assert.match(summary.evidence.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(summary.sourceMap, {
    fileName: "phase2-real-loss-source-map.json",
    byteLength: summary.sourceMap.byteLength,
    sha256: summary.sourceMap.sha256,
  });
  assert.ok(Number.isSafeInteger(summary.sourceMap.byteLength) && summary.sourceMap.byteLength > 0);
  assert.match(summary.sourceMap.sha256, /^[0-9a-f]{64}$/);

  assert.equal(record.schemaVersion, "witness-tree/phase2-real-loss-component-inventory-readback/1");
  assert.equal(record.status, "exact-readback-passed");
  assert.equal(record.sourceBatchId, "phase2-real-national-1984-2022-v1");
  assert.equal(record.canonicalPairCount, 38);
  assert.equal(record.completedPairCount, 38);
  assert.equal(record.approvedComponentLineageCapBytes, 2_199_023_255_552);
  assert.equal(record.scratchBytes, 0);
  assert.equal(record.released, false);
  assert.equal(record.productionEligible, false);
  assert.equal(record.executionObservation.approvedMaxSeconds, 345_600);
  assert.ok(Number(record.executionObservation.elapsedSeconds) > 0);
  assert.ok(Number(record.executionObservation.elapsedSeconds) <= 345_600);
  assert.equal(record.pairs.length, 38);
  assert.equal(sourceMap.schemaVersion, "witness-tree/phase2-real-loss-source-map/1");
  assert.equal(sourceMap.sourceBatchId, record.sourceBatchId);
  assert.equal(sourceMap.pairs.length, 38);
  assert.equal(sourceMap.released, false);
  assert.equal(sourceMap.productionEligible, false);
  for (let index = 0; index < 38; index++) {
    const row = record.pairs[index];
    const [fromYear, toYear, sourceSha256] = sourceMap.pairs[index];
    assert.deepEqual(row.pair, [fromYear, toYear]);
    assert.equal(row.sourceLoss.fileName, `detected-forest-loss-${fromYear}-${toYear}.tif`);
    assert.equal(row.sourceLoss.sha256, sourceSha256);
    assert.equal(row.lineage.fileName, `detected-forest-loss-${fromYear}-${toYear}.components.jsonl`);
    assert.match(row.lineage.sha256, /^[0-9a-f]{64}$/);
    assert.equal(row.lineage.componentRecordCount, row.inventory.connectedComponentCount);
    assert.ok(row.lineage.runRecordCount > 0);
    assert.ok(row.lineage.byteLength > 0);
  }

  assert.deepEqual(summary, {
    schemaVersion: "witness-tree/phase2-real-loss-component-inventory-summary/1",
    evidence: summary.evidence,
    sourceMap: summary.sourceMap,
    sourceBatchId: record.sourceBatchId,
    canonicalPairCount: record.canonicalPairCount,
    completedPairCount: record.completedPairCount,
    componentLineageBytes: sum(record.pairs, row => row.lineage.byteLength),
    retainedOutputBytes: record.retainedOutputBytes,
    lossCellCount: sum(record.pairs, row => row.inventory.lossCellCount),
    connectedComponentCount: sum(record.pairs, row => row.inventory.connectedComponentCount),
    runRecordCount: sum(record.pairs, row => row.lineage.runRecordCount),
    aliasRecordCount: sum(record.pairs, row => row.lineage.aliasRecordCount),
    released: false,
    productionEligible: false,
  });
  assert.equal(record.componentLineageBytes, summary.componentLineageBytes);
  assert.equal(record.retainedOutputBytes, summary.retainedOutputBytes);
  return record;
}

export function validatePinnedFiles(evidenceBytes, sourceMapBytes, summary) {
  assert.equal(evidenceBytes.byteLength, summary.evidence.byteLength);
  assert.equal(sha256(evidenceBytes), summary.evidence.sha256);
  assert.equal(sourceMapBytes.byteLength, summary.sourceMap.byteLength);
  assert.equal(sha256(sourceMapBytes), summary.sourceMap.sha256);
}

if (process.argv[1]?.endsWith("check-phase2-real-loss-component-inventory-evidence.mjs")) {
  const evidenceBytes = await readFile(new URL("../data/phase2-real-loss-component-inventory-readback.json", import.meta.url));
  const sourceMapBytes = await readFile(new URL("../data/phase2-real-loss-source-map.json", import.meta.url));
  const summary = JSON.parse(await readFile(new URL("../data/phase2-real-loss-component-inventory-summary.json", import.meta.url), "utf8"));
  validatePinnedFiles(evidenceBytes, sourceMapBytes, summary);
  validateComponentInventoryEvidence(JSON.parse(evidenceBytes), JSON.parse(sourceMapBytes), summary);
  console.log("Phase 2 exact 38-pair component-inventory evidence passed; productionEligible=false.");
}
