import seriesRecord from "@/data/phase2-per-cell-annual-series.json";

/** One annual interval, counted from the exact cell inventory. */
export type PerCellAnnualInterval = Readonly<{
  interval: string;
  startYear: number;
  endYear: number;
  patchCount: number;
  cellCount: number;
  hectares: number;
  harvestCells: number;
  harvestHectares: number;
  fireCells: number;
  fireHectares: number;
  unattributedCells: number;
  unattributedHectares: number;
  disturbanceYearsMissing: readonly string[];
  patchesWithBothCauses: number;
}>;

type PerCellAnnualSeries = Readonly<{
  schemaVersion: string;
  status: string;
  productId: string;
  cellHectares: number;
  countable: boolean;
  expertReviewed: boolean;
  complete: boolean;
  intervals: readonly PerCellAnnualInterval[];
  totals: Readonly<{
    intervalCount: number;
    patchCount: number;
    cellCount: number;
    hectares: number;
    harvestCells: number;
    harvestHectares: number;
    fireCells: number;
    fireHectares: number;
    unattributedCells: number;
    unattributedHectares: number;
  }>;
}>;

/**
 * The countable half of the per-cell product.
 *
 * The published tiles are a drawing: below the maximum zoom they are simplified
 * and the smallest patches are dropped, so totalling them returns a number that
 * is short by an unknown amount. This series is counted from the run-store cell
 * inventory instead, where one 30 m cell is 0.09 ha exactly, which is why it may
 * be added up and the tiles may not.
 *
 * It is countable, not complete and not reviewed. The land cover source writes 0
 * outside the area it maps, so unmapped ground cannot be told apart from mapped
 * ground with no loss, and every figure here is a minimum. Nobody has checked it
 * against conditions on the ground.
 */
export const EXPLORE_PER_CELL_ANNUAL_SERIES = Object.freeze(
  seriesRecord as PerCellAnnualSeries,
);

/**
 * The interval shown for a selected year.
 *
 * This deliberately repeats the rule in `archiveForYear` rather than inventing
 * its own: the figure on screen must describe the patches on screen, and a year
 * that resolved to a different interval in each place would put a number beside
 * a drawing it does not describe. `annualMatchesArchiveForEveryYear` in the
 * tests holds the two together.
 */
export function perCellAnnualForYear(year: number): PerCellAnnualInterval | null {
  if (!Number.isInteger(year)) return null;
  const intervals = EXPLORE_PER_CELL_ANNUAL_SERIES.intervals;
  return (
    intervals.find((entry) => entry.interval === `${year}-${year + 1}`) ??
    intervals.find((entry) => entry.interval === `${year - 1}-${year}`) ??
    null
  );
}
