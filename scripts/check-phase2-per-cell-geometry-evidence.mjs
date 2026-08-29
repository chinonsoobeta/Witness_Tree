import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Fail-closed gate for the per-cell geometry product.
//
// The store itself lives on the data root and is not present in CI, so this
// checks the readback record against evidence that was already in the
// repository before the product existed: the component inventory readback.
// Every interval's patch count, cell count and run count has to equal the
// inventory's own component count, loss cell count and run record count, and
// each interval has to name the exact lineage file it was derived from. A
// product that quietly gained or lost a patch cannot pass.
//
// It also refuses to let the product claim more than it is. Owner
// authorization permitted this work; it did not review it, release it, or
// make it production eligible, and the disturbance attribution is not
// evidence that undisturbed cells were undisturbed.

const here = (file) => new URL(`../${file}`, import.meta.url);
const read = async (file) => JSON.parse(await readFile(here(file), "utf8"));

export async function readPerCellGeometryEvidence() {
  const raw = await readFile(here("data/phase2-per-cell-geometry-readback.json"), "utf8");
  return {
    record: JSON.parse(raw),
    summary: await read("data/phase2-per-cell-geometry-summary.json"),
    inventory: await read("data/phase2-real-loss-component-inventory-readback.json"),
    method: await read("data/phase2-per-cell-geometry-method.json"),
    serializedSha256: createHash("sha256").update(raw).digest("hex"),
    serializedBytes: Buffer.byteLength(raw),
  };
}

export function validatePerCellGeometryEvidence({ record, summary, inventory, method, serializedSha256, serializedBytes }) {
  assert.equal(record.schemaVersion, "witness-tree/phase2-per-cell-geometry-readback/1");
  assert.equal(record.status, "exact-readback-passed");
  assert.equal(record.productId, "phase2-per-cell-geometry-1984-2022-v1");
  assert.equal(record.sourceProductId, "phase2-real-loss-component-inventory-1984-2022-v1");
  assert.equal(record.authorization, "data/phase2-zonal-aggregation-contract-amendment-2026-08-29.json");

  // The product exists. It has not been reviewed, released, or admitted, and
  // an owner authorization to build it is not any of those things.
  assert.equal(record.released, false);
  assert.equal(record.productionEligible, false);
  assert.equal(record.expertReviewed, false);
  assert.equal(method.claims.productionEligible ?? false, false);

  assert.equal(summary.evidence.fileName, "phase2-per-cell-geometry-readback.json");
  assert.equal(summary.evidence.sha256, serializedSha256, "the summary is bound to a different readback than the one on disk");
  assert.equal(summary.evidence.byteLength, serializedBytes);
  assert.equal(summary.patchCount, record.totals.patchCount);
  assert.equal(summary.cellCount, record.totals.cellCount);

  assert.equal(record.intervalCount, 38);
  assert.equal(record.intervals.length, 38);
  assert.equal(inventory.pairs.length, 38);
  assert.equal(record.grid.width, 193936);
  assert.equal(record.grid.height, 128340);
  assert.equal(record.grid.pixelWidth, 30);
  assert.equal(record.grid.pixelHeight, -30);

  let patchCount = 0;
  let runCount = 0;
  let cellCount = 0;
  for (let index = 0; index < 38; index += 1) {
    const entry = record.intervals[index];
    const pair = inventory.pairs[index];
    const label = `${pair.pair[0]}-${pair.pair[1]}`;
    assert.equal(entry.interval, label, `interval ${index} is out of order`);

    // Reconciliation against evidence that predates this product.
    assert.equal(entry.patchCount, pair.inventory.connectedComponentCount, `${label} patch count`);
    assert.equal(entry.cellCount, pair.inventory.lossCellCount, `${label} cell count`);
    assert.equal(entry.runCount, pair.lineage.runRecordCount, `${label} run count`);
    assert.equal(entry.aliasCount, pair.lineage.aliasRecordCount, `${label} alias count`);
    assert.equal(entry.peakOpenComponents, pair.inventory.maxActiveComponents, `${label} peak open components`);
    assert.equal(entry.source.fileName, pair.lineage.fileName, `${label} lineage file`);
    assert.equal(entry.source.sha256, pair.lineage.sha256, `${label} lineage checksum`);
    assert.equal(entry.source.byteLength, pair.lineage.byteLength, `${label} lineage byte length`);

    // The stored files have to be the size their record counts imply.
    assert.equal(entry.patches.byteLength, entry.patchCount * record.patchRecordBytes, `${label} patch store size`);
    assert.equal(entry.runs.byteLength, entry.runCount * record.runRecordBytes, `${label} run store size`);
    for (const digest of [entry.patches.sha256, entry.runs.sha256, entry.attribution.sha256]) {
      assert.match(digest, /^[0-9a-f]{64}$/, `${label} checksum shape`);
    }

    // Attribution can never exceed the cells there are to attribute.
    assert.ok(entry.attribution.harvestCells <= entry.cellCount, `${label} harvest cells exceed the interval`);
    assert.ok(entry.attribution.fireCells <= entry.cellCount, `${label} fire cells exceed the interval`);
    // 1984 predates the disturbance record, and the gate has to keep saying so.
    const expectedMissing = label.startsWith("1984") ? 2 : 0;
    assert.equal(entry.attribution.disturbanceYearsMissing.length, expectedMissing, `${label} disturbance coverage`);

    patchCount += entry.patchCount;
    runCount += entry.runCount;
    cellCount += entry.cellCount;
  }

  assert.equal(record.totals.patchCount, patchCount);
  assert.equal(record.totals.runCount, runCount);
  assert.equal(record.totals.cellCount, cellCount);

  // The disturbance record starts a year after the loss series, and the gate
  // keeps that fact attached to the product rather than leaving it to a memo.
  assert.equal(record.disturbanceRecord.firstRecordedYear, 1985);
  assert.equal(record.disturbanceRecord.lossSeriesFirstYear, 1984);
  assert.match(record.disturbanceRecord.zeroMeaning, /outside the mapped area/);
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = validatePerCellGeometryEvidence(await readPerCellGeometryEvidence());
  console.log(
    `Per-cell geometry evidence passes: ${record.intervalCount} intervals, ` +
      `${record.totals.patchCount.toLocaleString()} patches, ${record.totals.cellCount.toLocaleString()} cells.`,
  );
}
