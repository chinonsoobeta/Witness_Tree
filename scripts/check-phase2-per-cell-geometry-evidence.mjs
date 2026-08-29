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

// The release record is what the site actually reads, so it is gated too.
// Nothing else binds it: without this, the record could name different
// archives than the ones reconciled above, or flip `countable` to true, and
// every other check here would still pass.
export async function readPerCellTileRelease() {
  return JSON.parse(await readFile(new URL("../data/phase2-per-cell-tile-release.json", import.meta.url), "utf8"));
}

export function validatePerCellTileRelease(release, record) {
  assert.equal(release.schemaVersion, "witness-tree/phase2-per-cell-tile-release/1");
  assert.equal(release.productId, record.productId, "the release names a different product than the readback");

  // A published layer that no figure is counted from. These are the claims the
  // amendment said this work does not earn, so they are refused here rather
  // than left to whoever edits the record next.
  assert.equal(release.countable, false, "the per-cell layer is not countable");
  assert.equal(release.expertReviewed, false, "the per-cell layer is not expert reviewed");
  assert.equal(release.productionEligible, false, "the per-cell layer is not production eligible");

  // An unpublished record is a valid state: the site draws no per-cell layer
  // at all. A partly published one is not, because a reader selecting a year
  // in the gap would be shown nothing with no way to tell why.
  if (release.intervals.length === 0) {
    assert.equal(release.releaseId, "", "an unpublished record must not carry a release id");
    assert.equal(release.totals.intervalCount, 0);
    return release;
  }
  assert.equal(release.intervals.length, record.intervalCount, "the release does not cover every interval");

  // The release id is the digest of the archives' own digests, so a path that
  // served different bytes would have to change. Recomputing it here is what
  // makes that true rather than merely intended.
  const expectedId = createHash("sha256")
    .update(release.intervals.map((entry) => `${entry.interval}:${entry.sha256}`).join("\n"))
    .digest("hex");
  assert.equal(release.releaseId, expectedId, "the release id is not the digest of its archives");
  assert.ok(release.base.endsWith(`/${release.releaseId}/tiles`), "the base path does not carry the release id");

  const byInterval = new Map(record.intervals.map((entry) => [entry.interval, entry]));
  let byteLength = 0;
  for (const entry of release.intervals) {
    const reconciled = byInterval.get(entry.interval);
    assert.ok(reconciled !== undefined, `${entry.interval} is not an interval the readback reconciled`);
    assert.equal(entry.patchCount, reconciled.patchCount, `${entry.interval} patch count`);
    assert.equal(entry.cellCount, reconciled.cellCount, `${entry.interval} cell count`);
    assert.equal(entry.harvestCells, reconciled.attribution.harvestCells, `${entry.interval} harvest cells`);
    assert.equal(entry.fireCells, reconciled.attribution.fireCells, `${entry.interval} fire cells`);
    assert.equal(entry.fileName, `${entry.interval}.pmtiles`, `${entry.interval} file name`);
    assert.equal(entry.url, `${release.base}/${entry.fileName}`, `${entry.interval} url`);
    assert.ok(entry.byteLength > 0, `${entry.interval} byte length`);
    byteLength += entry.byteLength;
  }
  assert.equal(release.totals.intervalCount, release.intervals.length);
  assert.equal(release.totals.byteLength, byteLength);
  return release;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = validatePerCellGeometryEvidence(await readPerCellGeometryEvidence());
  const release = validatePerCellTileRelease(await readPerCellTileRelease(), record);
  console.log(
    `Per-cell geometry evidence passes: ${record.intervalCount} intervals, ` +
      `${record.totals.patchCount.toLocaleString()} patches, ${record.totals.cellCount.toLocaleString()} cells.`,
  );
  console.log(
    release.intervals.length === 0
      ? "Tile release: not published, so the site draws no per-cell layer."
      : `Tile release ${release.releaseId.slice(0, 12)}: ${release.intervals.length} archives, ` +
        `${(release.totals.byteLength / 1e9).toFixed(1)} GB.`,
  );
}
