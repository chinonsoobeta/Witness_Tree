import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Two artifacts describe the same forest loss and only one of them may be
 * totalled. The tiles are generalized for drawing and drop the smallest
 * patches; the run-store inventory is an exact cell count. This gate holds
 * that line: it proves the series is arithmetic on the exact count, and it
 * proves in the same pass that the tile release has not quietly become
 * countable. Checking them apart would let the pair drift into agreement on
 * the wrong side.
 */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const CELL_HECTARES = 0.09;
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));

export function validatePerCellAnnualSeries(series, readback, readbackBytes, tileRelease) {
  assert.equal(series?.schemaVersion, "witness-tree/phase2-per-cell-annual-series/1");
  assert.equal(series.status, "countable-unreviewed-minimum");
  assert.equal(series.productId, readback.productId, "the series names a different product than the readback");

  // The series is only countable because of where it counts from, so the
  // binding to that source is checked byte for byte rather than by path.
  assert.equal(series.source.path, "data/phase2-per-cell-geometry-readback.json");
  assert.equal(series.source.byteLength, readbackBytes.byteLength, "the bound readback length drifted");
  assert.equal(series.source.sha256, createHash("sha256").update(readbackBytes).digest("hex"), "the bound readback digest drifted");

  assert.equal(series.cellHectares, CELL_HECTARES, "a 30 m cell is 0.09 ha; changing this restates every figure");
  assert.equal(readback.grid.pixelWidth, 30, "the cell area assumes a 30 m grid");
  assert.equal(readback.grid.pixelHeight, -30, "the cell area assumes a 30 m grid");

  assert.equal(series.intervals.length, readback.intervals.length, "the series and the readback disagree on interval count");

  let cells = 0;
  let patches = 0;
  for (const [index, entry] of series.intervals.entries()) {
    const source = readback.intervals[index];
    assert.equal(entry.interval, source.interval, `interval ${index} drifted from the readback`);
    assert.equal(entry.cellCount, source.cellCount, `${entry.interval} cell count drifted`);
    assert.equal(entry.patchCount, source.patchCount, `${entry.interval} patch count drifted`);

    // Every hectare figure must be the exact count times the exact cell area.
    const expected = Number((entry.cellCount * CELL_HECTARES).toFixed(2));
    assert.equal(entry.hectares, expected, `${entry.interval} hectares are not the cell count times the cell area`);
    assert.equal(entry.harvestHectares, Number((entry.harvestCells * CELL_HECTARES).toFixed(2)), `${entry.interval} harvest hectares drifted`);
    assert.equal(entry.fireHectares, Number((entry.fireCells * CELL_HECTARES).toFixed(2)), `${entry.interval} fire hectares drifted`);

    // A cause split that exceeds the detected total would be counting cells
    // twice, which is the one way this series could silently overstate loss.
    assert.equal(entry.harvestCells, source.attribution.harvestCells, `${entry.interval} harvest cells drifted`);
    assert.equal(entry.fireCells, source.attribution.fireCells, `${entry.interval} fire cells drifted`);
    assert.equal(entry.unattributedCells, entry.cellCount - entry.harvestCells - entry.fireCells, `${entry.interval} remainder drifted`);
    assert.ok(entry.unattributedCells >= 0, `${entry.interval} attributes more cells than it detected`);

    cells += entry.cellCount;
    patches += entry.patchCount;
  }

  assert.equal(cells, readback.totals.cellCount, "the series total does not reconcile with the readback total");
  assert.equal(patches, readback.totals.patchCount, "the series patch total does not reconcile with the readback total");
  assert.equal(series.totals.cellCount, cells, "the recorded cell total drifted");
  assert.equal(series.totals.hectares, Number((cells * CELL_HECTARES).toFixed(2)), "the recorded hectare total drifted");

  // The series may be counted. It is still not complete, not reviewed, and
  // not checked against the ground, and it may not say otherwise.
  assert.deepEqual(series.claims, { countable: true, complete: false, expertReviewed: false, groundTruthed: false }, "the series claims drifted");
  assert.equal(series.expertReviewed, false, "no expert review was performed on this product");
  assert.equal(series.complete, false, "the source maps only part of the country, so every figure is a minimum");
  assert.match(series.completenessBasis, /minimum/i, "the series must say why it is a minimum");
  assert.equal(series.ownerDecision.record, "data/phase2-expert-review-retirement-2026-08-30.json");

  // The other half of the line: the drawing layer stays uncountable.
  assert.equal(tileRelease.countable, false, "the tile release became countable; tiles drop small patches and cannot be totalled");
  assert.equal(tileRelease.expertReviewed, false, "the tile release claims a review that did not happen");
  assert.match(series.countableBasis, /not from the published tiles/i, "the series must say it does not count from the tiles");

  return { intervals: series.intervals.length, hectares: series.totals.hectares };
}

export function checkPerCellAnnualSeries() {
  const readbackBytes = readFileSync(resolve(ROOT, "data/phase2-per-cell-geometry-readback.json"));
  return validatePerCellAnnualSeries(
    readJson("data/phase2-per-cell-annual-series.json"),
    JSON.parse(readbackBytes),
    readbackBytes,
    readJson("data/phase2-per-cell-tile-release.json"),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = checkPerCellAnnualSeries();
  console.log(`Per-cell annual series: ${result.intervals} intervals, ${result.hectares.toLocaleString("en-CA")} ha, countable from the exact inventory and not from the tiles.`);
}
