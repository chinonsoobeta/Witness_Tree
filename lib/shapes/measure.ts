/**
 * Measures a drawn shape over a year window from the coarse-grid blocks.
 *
 * Two numbers are reported, and they are not interchangeable.  The union
 * counts each cell once however many times it was disturbed, so it can be
 * given as a share of the forest.  The sum adds the annual counts, so a cell
 * disturbed twice appears twice; it is only ever hectares.  This mirrors the
 * rest of the product and is enforced by the checker.
 *
 * Because the grid answers per 960 m block, a shape's edge blocks are counted
 * by their intersection fraction.  That makes the middle number an estimate
 * bracketed by two facts: the interior blocks alone are a floor, and the
 * interior plus whole edge blocks are a ceiling.  All three travel together,
 * so a reader is never handed the estimate on its own.
 */
import { BLOCK_HECTARES, type BlockCoverage, type ShapeCoverage } from "./coverage";
import { FIRST_STEP_YEAR, STEPS, type PackedBlock } from "./tiles";

/** A 30 m cell covers 0.09 ha. */
export const CELL_HECTARES = 0.09;

export type Bracket = Readonly<{ low: number; estimate: number; high: number }>;

export type ShapeMeasurement = Readonly<{
  startYear: number;
  endYear: number;
  /** Cells disturbed at least once in the window. */
  unionHectares: Bracket;
  /** Annual counts added together, which double-counts repeat disturbance. */
  sumHectares: Bracket;
  /** Forest known at the start of the window, the only honest denominator. */
  forestHectares: Bracket;
  /** Union as a share of that forest, or null when there is no forest to divide by. */
  unionShareOfForest: number | null;
  coverage: Readonly<{
    blocks: number;
    interiorBlocks: number;
    edgeBlocks: number;
    /** Blocks the shape covers that carry no countable cell at all. */
    blocksWithoutData: number;
    countableHectares: number;
    mappedHectares: number;
    shapeHectares: number;
    outsideGridHectares: number;
    /** Share of the estimate contributed by partially covered blocks. */
    edgeShareOfEstimate: number;
  }>;
  precision: Readonly<{
    blockMetres: number;
    /** True when every contributing block was wholly inside the shape. */
    exact: boolean;
  }>;
}>;

export class WindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WindowError";
  }
}

/** Steps are year-to-year transitions, so a window names the years it spans. */
export function stepRangeForYears(startYear: number, endYear: number): { first: number; last: number } {
  const first = startYear - FIRST_STEP_YEAR;
  const last = endYear - FIRST_STEP_YEAR - 1;
  if (!Number.isInteger(first) || !Number.isInteger(last)) {
    throw new WindowError("A year window must be whole years.");
  }
  if (first < 0 || last >= STEPS || first > last) {
    throw new WindowError(`A year window must fall inside ${FIRST_STEP_YEAR} to ${FIRST_STEP_YEAR + STEPS}.`);
  }
  return { first, last };
}

type Accumulator = { low: number; estimate: number; high: number };

const zero = (): Accumulator => ({ low: 0, estimate: 0, high: 0 });

function add(target: Accumulator, value: number, fraction: number, interior: boolean): void {
  target.estimate += value * fraction;
  target.high += value;
  if (interior) target.low += value;
}

const toHectares = (accumulated: Accumulator, perUnit: number): Bracket => ({
  low: accumulated.low * perUnit,
  estimate: accumulated.estimate * perUnit,
  high: accumulated.high * perUnit,
});

/**
 * Measures the window over the covered blocks.  Blocks the shape covers that
 * the packed grid never carried are counted as blocks without data rather than
 * as zeroes, because "no forest was lost here" and "this was never measured"
 * are different answers.
 */
export function measureShape(
  coverage: ShapeCoverage,
  blocks: ReadonlyMap<string, PackedBlock>,
  startYear: number,
  endYear: number,
): ShapeMeasurement {
  const { first, last } = stepRangeForYears(startYear, endYear);

  const union = zero();
  const sum = zero();
  const forest = zero();
  let countableCells = 0;
  let mappedCells = 0;
  let blocksWithoutData = 0;
  let edgeEstimate = 0;

  for (const cell of coverage.blocks as readonly BlockCoverage[]) {
    const packed = blocks.get(`${cell.gx},${cell.gy}`);
    if (!packed) {
      blocksWithoutData += 1;
      continue;
    }
    const interior = cell.fraction >= 1;

    let blockSum = 0;
    for (let step = first; step <= last; step += 1) blockSum += packed.annualLossCells[step];
    let overcount = 0;
    for (const [pairFirst, pairSecond, cells] of packed.pairs) {
      if (pairFirst >= first && pairSecond <= last) overcount += cells;
    }
    const blockUnion = blockSum - overcount;
    if (blockUnion < 0) {
      throw new WindowError("A block reported more repeat disturbance than disturbance.");
    }

    add(sum, blockSum, cell.fraction, interior);
    add(union, blockUnion, cell.fraction, interior);
    add(forest, packed.forestKnownCells[first], cell.fraction, interior);
    countableCells += packed.countableCells * cell.fraction;
    mappedCells += packed.mappedCells * cell.fraction;
    if (!interior) edgeEstimate += blockUnion * cell.fraction;
  }

  const unionHectares = toHectares(union, CELL_HECTARES);
  const forestHectares = toHectares(forest, CELL_HECTARES);

  return {
    startYear,
    endYear,
    unionHectares,
    sumHectares: toHectares(sum, CELL_HECTARES),
    forestHectares,
    unionShareOfForest:
      forestHectares.estimate > 0 ? unionHectares.estimate / forestHectares.estimate : null,
    coverage: {
      blocks: coverage.blocks.length,
      interiorBlocks: coverage.interiorBlocks,
      edgeBlocks: coverage.edgeBlocks,
      blocksWithoutData,
      countableHectares: countableCells * CELL_HECTARES,
      mappedHectares: mappedCells * CELL_HECTARES,
      shapeHectares: coverage.areaHectares,
      outsideGridHectares: coverage.outsideGridHectares,
      edgeShareOfEstimate: union.estimate > 0 ? edgeEstimate / union.estimate : 0,
    },
    precision: {
      blockMetres: Math.round(Math.sqrt(BLOCK_HECTARES * 10_000)),
      exact: coverage.edgeBlocks === 0 && blocksWithoutData === 0,
    },
  };
}
