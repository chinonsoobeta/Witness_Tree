import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPLORE_PER_CELL_ANNUAL_SERIES,
  perCellAnnualForYear,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/annual-series.ts";
import {
  EXPLORE_PER_CELL_LAYER,
  fourProvinceAnnualForYear,
  perCellArchiveForYear,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/per-cell.ts";

test("the annual figure describes the same interval the map draws, for every year", () => {
  /*
   * The number and the patches are resolved by two separate functions. If they
   * ever disagree, the page puts a total beside a drawing of a different year,
   * which is a quieter failure than showing nothing and a worse one. This is
   * the test that holds them together, and it asks the pair Explore actually
   * calls: the four-province figure beside the four-province patches.
   */
  assert.ok(EXPLORE_PER_CELL_LAYER.intervals.length > 0, "the release is empty, so this would pass vacuously");

  for (let year = 1985; year <= 2022; year += 1) {
    const archive = perCellArchiveForYear(year);
    const annual = fourProvinceAnnualForYear(year);
    assert.equal(
      annual?.interval ?? null,
      archive?.interval ?? null,
      `year ${year} resolves to different intervals for the figure and the drawing`,
    );
    // The national series must still resolve the same interval for the same
    // year, or a reader moving between the two records would be reading one
    // year's figure as another's.
    assert.equal(
      perCellAnnualForYear(year)?.interval ?? null,
      archive?.interval ?? null,
      `year ${year} resolves to a different interval in the national series`,
    );
  }
});

test("the figures beside the map are the four-province scope, not the national one", () => {
  /*
   * Explore draws patches clipped to British Columbia, Alberta, Ontario and
   * Québec, so the figures beside them must be counted over those same four
   * provinces. Until 2026-09-19 this test asserted the drawing layer's counts
   * equalled the national series, which was true only while the layer was the
   * national archive. Asserting that again now would put a national total
   * beside a four-province drawing, which is exactly what this file exists to
   * prevent.
   *
   * Equality against the layer would be vacuous, because the four-province
   * figures are derived from it. What is not vacuous is the scope: every
   * interval must also exist nationally, and must be strictly smaller there,
   * because four provinces are a strict subset of the country. If the layer
   * were ever re-pointed at the national archive, these comparisons would
   * collapse to equality and fail.
   */
  assert.equal(EXPLORE_PER_CELL_LAYER.intervals.length, EXPLORE_PER_CELL_ANNUAL_SERIES.intervals.length);

  let fourProvinceCells = 0;
  let nationalCells = 0;
  for (const archive of EXPLORE_PER_CELL_LAYER.intervals) {
    const national = EXPLORE_PER_CELL_ANNUAL_SERIES.intervals.find(
      (entry: { interval: string }) => entry.interval === archive.interval,
    );
    assert.ok(national, `${archive.interval} is drawn but absent from the national series`);
    assert.ok(archive.cellCount > 0, `${archive.interval} draws no cells`);
    assert.ok(
      archive.cellCount < national.cellCount,
      `${archive.interval} clipped to four provinces is not smaller than the national count`,
    );
    assert.ok(
      archive.patchCount <= national.patchCount,
      `${archive.interval} has more clipped patches than national patches`,
    );
    fourProvinceCells += archive.cellCount;
    nationalCells += national.cellCount;
  }
  assert.ok(fourProvinceCells < nationalCells, "the four provinces cannot hold every loss cell in the country");
});

test("the four-province figure is counted from the interval it names and its causes add up", () => {
  // The cause split is the part a reader can check by eye: harvest plus fire
  // plus the unattributed rest is the interval's loss, and the hectares are
  // the cells at the exact 0.09 ha the 30 m grid gives.
  for (const archive of EXPLORE_PER_CELL_LAYER.intervals) {
    const endYear = Number(archive.interval.split("-")[1]);
    const annual = fourProvinceAnnualForYear(endYear);
    assert.ok(annual, `${archive.interval} has no four-province figure`);
    assert.equal(annual.interval, archive.interval);
    assert.equal(annual.cellCount, archive.cellCount, `${archive.interval} cell count disagrees`);
    assert.equal(annual.patchCount, archive.patchCount, `${archive.interval} patch count disagrees`);
    assert.equal(
      annual.harvestCells + annual.fireCells + annual.unattributedCells,
      annual.cellCount,
      `${archive.interval} causes do not add up to the loss`,
    );
    assert.ok(annual.unattributedCells >= 0, `${archive.interval} attributes more cells than it lost`);
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
