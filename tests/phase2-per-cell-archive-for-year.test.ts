import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveForYear,
  perCellArchiveForYear,
  EXPLORE_PER_CELL_LAYER,
  type PerCellArchive,
} from "../lib/explore/per-cell";

/**
 * The full 38 annual intervals the pipeline produces, 1984-1985 through
 * 2021-2022. Only the interval name matters to the mapping, so the rest of
 * each archive is filled with values that would be obviously wrong if any of
 * them ever reached a reader.
 */
const intervals: readonly PerCellArchive[] = Array.from({ length: 38 }, (_, index) => {
  const start = 1984 + index;
  return {
    interval: `${start}-${start + 1}`,
    fileName: `${start}-${start + 1}.pmtiles`,
    byteLength: 0,
    sha256: "0".repeat(64),
    patchCount: 0,
    cellCount: 0,
    harvestCells: 0,
    fireCells: 0,
    url: "",
  };
});

test("a year is shown by the interval that ends on it", () => {
  assert.equal(archiveForYear(intervals, 1985)?.interval, "1984-1985");
  assert.equal(archiveForYear(intervals, 1999)?.interval, "1998-1999");
  assert.equal(archiveForYear(intervals, 2022)?.interval, "2021-2022");
  // Every selectable year resolves to exactly the interval named by the
  // slider: change between the preceding year and the selected year.
  for (const entry of intervals) {
    const end = Number(entry.interval.split("-")[1]);
    assert.equal(archiveForYear(intervals, end)?.interval, entry.interval);
  }
});

test("a year outside the series has no archive rather than a nearest one", () => {
  assert.equal(archiveForYear(intervals, 2023), null);
  assert.equal(archiveForYear(intervals, 1984), null);
  assert.equal(archiveForYear(intervals, 1983), null);
  assert.equal(archiveForYear(intervals, 1900), null);
  assert.equal(archiveForYear(intervals, 3000), null);
});

test("a non-integer or unusable year resolves to nothing", () => {
  // The route parses the year from a query parameter, so these are reachable.
  assert.equal(archiveForYear(intervals, 1999.5), null);
  assert.equal(archiveForYear(intervals, Number.NaN), null);
  assert.equal(archiveForYear(intervals, Number.POSITIVE_INFINITY), null);
});

test("an unbuilt release yields nothing for every year in the series", () => {
  for (let year = 1984; year <= 2022; year += 1) {
    assert.equal(archiveForYear([], year), null);
  }
});

test("the exported function reads the published release", () => {
  // Guards the wiring rather than the mapping. While the release is unbuilt
  // this asserts the honest empty state; once the tiles are published the same
  // assertion pins the real endpoints, so it cannot pass vacuously in either
  // state.
  const published = EXPLORE_PER_CELL_LAYER.intervals;
  assert.equal(published.length, EXPLORE_PER_CELL_LAYER.totals.intervalCount);
  if (published.length === 0) {
    assert.equal(perCellArchiveForYear(1999), null);
    return;
  }
  assert.equal(published.length, 38);
  assert.equal(perCellArchiveForYear(1985)?.interval, "1984-1985");
  assert.equal(perCellArchiveForYear(2021)?.interval, "2020-2021");
  assert.equal(perCellArchiveForYear(2022)?.interval, "2021-2022");
  assert.equal(perCellArchiveForYear(2023), null);
});
