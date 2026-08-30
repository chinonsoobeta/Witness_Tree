import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

/*
 * The countable annual series.
 *
 * The published PMTiles archives are a drawing layer: below the maximum zoom
 * the tiler simplifies geometry and, in crowded tiles, drops the smallest
 * patches. Totalling them would not produce an unreviewed figure, it would
 * produce a wrong one, short by an amount that varies with zoom and density.
 *
 * The run store behind them is exact. It records, per interval, how many 30 m
 * cells were detected as loss, reconciled patch for patch against the
 * component inventory. One cell is 30 m by 30 m, which is 0.09 ha exactly, so
 * the hectares here are arithmetic on an exact count rather than a measurement
 * of a generalized polygon. That is what makes this series countable and the
 * tiles not, and the distinction is the whole reason this file exists.
 *
 * What the series is still not: complete, or reviewed. It counts detected loss
 * inside the area the land cover source actually maps, so every figure is a
 * minimum, and nobody has checked it against ground truth.
 */

const CELL_HECTARES = 0.09;
const READBACK = "data/phase2-per-cell-geometry-readback.json";

const bytes = await readFile(new URL(`../${READBACK}`, import.meta.url));
const readback = JSON.parse(bytes);
const readbackSha256 = createHash("sha256").update(bytes).digest("hex");

if (readback.grid.pixelWidth !== 30 || readback.grid.pixelHeight !== -30) {
  throw new Error(`the series assumes a 30 m grid; the readback records ${readback.grid.pixelWidth}x${readback.grid.pixelHeight}`);
}

const hectares = (cells) => Number((cells * CELL_HECTARES).toFixed(2));

const intervals = readback.intervals.map((entry) => {
  const { harvestCells, fireCells, patchesWithBoth, disturbanceYearsMissing } = entry.attribution;
  /*
   * Attribution is only meaningful if the two causes do not double count, and
   * the unit that matters is the cell, not the patch. A patch touching both a
   * harvest and a fire record is a real thing the readback counts separately
   * as patchesWithBoth; it does not put any cell in both totals. The check
   * that would catch double counting is the cell one below, so that is the one
   * that throws, and the patch overlap is carried through as a fact about how
   * mixed the interval is.
   */
  const attributedCells = harvestCells + fireCells;
  if (attributedCells > entry.cellCount) {
    throw new Error(`${entry.interval} attributes ${attributedCells} cells of ${entry.cellCount} detected`);
  }
  return {
    interval: entry.interval,
    startYear: Number(entry.interval.slice(0, 4)),
    endYear: Number(entry.interval.slice(5)),
    patchCount: entry.patchCount,
    cellCount: entry.cellCount,
    hectares: hectares(entry.cellCount),
    harvestCells,
    harvestHectares: hectares(harvestCells),
    fireCells,
    fireHectares: hectares(fireCells),
    unattributedCells: entry.cellCount - attributedCells,
    unattributedHectares: hectares(entry.cellCount - attributedCells),
    // An interval whose disturbance rasters do not cover both of its years
    // cannot have a complete cause split, and says so rather than implying the
    // unattributed remainder is genuinely of unknown cause.
    disturbanceYearsMissing: disturbanceYearsMissing ?? [],
    patchesWithBothCauses: patchesWithBoth,
  };
});

const sum = (pick) => intervals.reduce((running, entry) => running + pick(entry), 0);
const totalCells = sum((entry) => entry.cellCount);
if (totalCells !== readback.totals.cellCount) {
  throw new Error(`the series totals ${totalCells} cells; the readback totals ${readback.totals.cellCount}`);
}

await writeFile(
  new URL("../data/phase2-per-cell-annual-series.json", import.meta.url),
  `${JSON.stringify(
    {
      schemaVersion: "witness-tree/phase2-per-cell-annual-series/1",
      status: "countable-unreviewed-minimum",
      productId: readback.productId,
      source: { path: READBACK, sha256: readbackSha256, byteLength: bytes.byteLength },
      cellHectares: CELL_HECTARES,
      countable: true,
      countableBasis:
        "Counted from the exact run-store cell inventory, not from the published tiles. The tiles generalize and drop small patches below the maximum zoom and remain uncountable.",
      expertReviewed: false,
      complete: false,
      completenessBasis:
        "Detected loss inside the area the land cover source maps. The source writes 0 outside its mapped extent, so unmapped ground cannot be distinguished from mapped ground with no loss. Every figure is a minimum.",
      ownerDecision: {
        decidedAt: "2026-08-30",
        decidedBy: "owner",
        decision:
          "The owner accepted publishing figures derived from this unreviewed automated trace, after the expert-review requirement was retired on the same day.",
        record: "data/phase2-expert-review-retirement-2026-08-30.json",
      },
      intervals,
      totals: {
        intervalCount: intervals.length,
        patchCount: sum((entry) => entry.patchCount),
        cellCount: totalCells,
        hectares: hectares(totalCells),
        harvestCells: sum((entry) => entry.harvestCells),
        harvestHectares: hectares(sum((entry) => entry.harvestCells)),
        fireCells: sum((entry) => entry.fireCells),
        fireHectares: hectares(sum((entry) => entry.fireCells)),
        unattributedCells: sum((entry) => entry.unattributedCells),
        unattributedHectares: hectares(sum((entry) => entry.unattributedCells)),
      },
      claims: { countable: true, complete: false, expertReviewed: false, groundTruthed: false },
    },
    null,
    2,
  )}\n`,
);

console.log(`${intervals.length} intervals, ${hectares(totalCells).toLocaleString("en-CA")} ha detected loss, ${readback.totals.cellCount.toLocaleString("en-CA")} cells`);
