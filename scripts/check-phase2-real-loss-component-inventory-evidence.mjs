import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const EVIDENCE_SHA256 = "6f86a223a17fa0c152573c685ce885b97601f7f082c99760c891bba80c40e204";
const LINEAGE_BYTES = 68_322_891_854;
const RETAINED_BYTES = 68_322_924_822;
const LOSS_CELLS = 1_384_027_417;
const COMPONENTS = 303_530_909;
const RUNS = 528_596_703;
const ALIASES = 12_199_309;

const sum = (rows, select) => rows.reduce((total, row) => total + select(row), 0);

export function validateComponentInventoryEvidence(record, sourceMap) {
  assert.equal(createHash("sha256").update(`${JSON.stringify(record, null, 2)}\n`).digest("hex"), EVIDENCE_SHA256);
  assert.equal(record.schemaVersion, "witness-tree/phase2-real-loss-component-inventory-readback/1");
  assert.equal(record.status, "exact-readback-passed");
  assert.equal(record.sourceBatchId, "phase2-real-national-1984-2022-v1");
  assert.equal(record.canonicalPairCount, 38);
  assert.equal(record.completedPairCount, 38);
  assert.equal(record.componentLineageBytes, LINEAGE_BYTES);
  assert.equal(record.retainedOutputBytes, RETAINED_BYTES);
  assert.equal(record.approvedComponentLineageCapBytes, 2_199_023_255_552);
  assert.equal(record.scratchBytes, 0);
  assert.equal(record.released, false);
  assert.equal(record.productionEligible, false);
  assert.equal(record.executionObservation.approvedMaxSeconds, 345_600);
  assert.ok(Number(record.executionObservation.elapsedSeconds) > 0);
  assert.ok(Number(record.executionObservation.elapsedSeconds) <= 345_600);
  assert.equal(record.pairs.length, 38);
  assert.equal(sourceMap.pairs.length, 38);
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
  assert.equal(sum(record.pairs, row => row.lineage.byteLength), LINEAGE_BYTES);
  assert.equal(sum(record.pairs, row => row.inventory.lossCellCount), LOSS_CELLS);
  assert.equal(sum(record.pairs, row => row.inventory.connectedComponentCount), COMPONENTS);
  assert.equal(sum(record.pairs, row => row.lineage.runRecordCount), RUNS);
  assert.equal(sum(record.pairs, row => row.lineage.aliasRecordCount), ALIASES);
  return record;
}

if (process.argv[1]?.endsWith("check-phase2-real-loss-component-inventory-evidence.mjs")) {
  const evidenceBytes = await readFile(new URL("../data/phase2-real-loss-component-inventory-readback.json", import.meta.url));
  assert.equal(createHash("sha256").update(evidenceBytes).digest("hex"), EVIDENCE_SHA256);
  const sourceMap = JSON.parse(await readFile(new URL("../data/phase2-real-loss-source-map.json", import.meta.url), "utf8"));
  validateComponentInventoryEvidence(JSON.parse(evidenceBytes), sourceMap);
  console.log("Phase 2 exact 38-pair component-inventory evidence passed; productionEligible=false.");
}
