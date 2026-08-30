import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPLORE_PER_CELL_ANNUAL_SERIES,
  perCellAnnualForYear,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/annual-series.ts";
import {
  EXPLORE_PER_CELL_LAYER,
  perCellArchiveForYear,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/per-cell.ts";

test("the annual figure describes the same interval the map draws, for every year", () => {
  /*
   * The number and the patches are resolved by two separate functions over two
   * separate records. If they ever disagree, the page puts a total beside a
   * drawing of a different year, which is a quieter failure than showing
   * nothing and a worse one. This is the test that holds them together.
   */
  assert.ok(EXPLORE_PER_CELL_LAYER.intervals.length > 0, "the release is empty, so this would pass vacuously");

  for (let year = 1985; year <= 2022; year += 1) {
    const archive = perCellArchiveForYear(year);
    const annual = perCellAnnualForYear(year);
    assert.equal(
      annual?.interval ?? null,
      archive?.interval ?? null,
      `year ${year} resolves to different intervals for the figure and the drawing`,
    );
  }
});

test("the annual figure equals the cell count the archive reports for that interval", () => {
  // The two records are built from the same run store, so a mismatch means one
  // of them was rebuilt without the other.
  for (const archive of EXPLORE_PER_CELL_LAYER.intervals) {
    const annual = EXPLORE_PER_CELL_ANNUAL_SERIES.intervals.find(
      (entry: { interval: string }) => entry.interval === archive.interval,
    );
    assert.ok(annual, `${archive.interval} is published but absent from the annual series`);
    assert.equal(annual.cellCount, archive.cellCount, `${archive.interval} cell count disagrees`);
    assert.equal(annual.patchCount, archive.patchCount, `${archive.interval} patch count disagrees`);
    assert.equal(annual.hectares, Number((archive.cellCount * 0.09).toFixed(2)), `${archive.interval} hectares disagree`);
  }
});

test("the series is countable and the drawing layer is not", () => {
  assert.equal(EXPLORE_PER_CELL_ANNUAL_SERIES.countable, true);
  assert.equal(EXPLORE_PER_CELL_LAYER.countable, false);
  // Neither may claim a review that nobody performed.
  assert.equal(EXPLORE_PER_CELL_ANNUAL_SERIES.expertReviewed, false);
  assert.equal(EXPLORE_PER_CELL_LAYER.expertReviewed, false);
  // Countable is not complete: the source maps only part of the country.
  assert.equal(EXPLORE_PER_CELL_ANNUAL_SERIES.complete, false);
});

test("a year outside the series resolves to nothing rather than to a neighbour", () => {
  assert.equal(perCellAnnualForYear(1984), null);
  assert.equal(perCellAnnualForYear(1983), null);
  assert.equal(perCellAnnualForYear(2023), null);
  assert.equal(perCellAnnualForYear(2000.5), null);
});
