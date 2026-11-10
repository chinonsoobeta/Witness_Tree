/**
 * One area's detected loss for each of the 38 annual steps, 1985 to 2022, as
 * its page's chart and table show it.
 *
 * Each year is that year's own detected loss: forest cells that stopped being
 * forest between the year before and that year. A cell lost in two years
 * counts in both, so the years are never added up into a total; the page's
 * whole-record figure is the forest lost at least once.
 *
 * The coverage rule is the whole-record one, applied to each annual step:
 * - all of the area's forest was mapped at the step's start (or the unmapped
 *   share is under the caller's tolerance): the hectares, including a measured 0;
 * - part has no satellite data: the hectares detected where it was mapped,
 *   marked a minimum, or Unknown when nothing was detected there;
 * - no forest was mapped at the step's start: Unknown, a gap, never 0.
 */

export const YEARLY_FIRST_YEAR = 1985;
export const YEARLY_STEP_COUNT = 38;

const CELL_HECTARES = 0.09;
const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;

export type YearlyCells = Readonly<{
  /** Cells lost in each annual step, 1984–1985 first. */
  loss: readonly number[];
  /** Forest cells mapped at each step's start. */
  known: readonly number[];
  /** Cells with no satellite data at each step's start: the larger of the record's unknown and unmapped counts. */
  unknown: readonly number[];
}>;

export type YearlyRow =
  | Readonly<{ year: number; kind: "figure"; hectares: number }>
  | Readonly<{ year: number; kind: "minimum"; hectares: number }>
  | Readonly<{ year: number; kind: "unknown"; reason: "no-forest-mapped" | "nothing-detected-where-mapped" }>;

export function yearlyRows(cells: YearlyCells, unknownTolerancePercent = 0): readonly YearlyRow[] {
  for (const series of [cells.loss, cells.known, cells.unknown]) {
    if (series.length !== YEARLY_STEP_COUNT || !series.every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("A yearly series must hold 38 non-negative whole cell counts.");
    }
  }
  return cells.loss.map((loss, step): YearlyRow => {
    const year = YEARLY_FIRST_YEAR + step;
    const known = cells.known[step]!;
    const unknown = cells.unknown[step]!;
    if (loss > known) throw new Error(`The ${year} loss exceeds the forest mapped at its start.`);
    if (known === 0) return { year, kind: "unknown", reason: "no-forest-mapped" };
    const unknownPercent = (unknown / (known + unknown)) * 100;
    const partial = unknown > 0 && !(unknownPercent < unknownTolerancePercent);
    if (!partial) return { year, kind: "figure", hectares: hectares(loss) };
    if (loss === 0) return { year, kind: "unknown", reason: "nothing-detected-where-mapped" };
    return { year, kind: "minimum", hectares: hectares(loss) };
  });
}
