import type { BoundaryMeasurementCoverage } from "./boundary-readout";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  intervalWindowIndex,
  type ExploreInterval,
} from "./interval";

/**
 * Decodes one area's compact interval record and answers any span from it.
 *
 * Ridings, economic regions and census subdivisions share this encoding (see
 * compactDistrict in scripts/build-phase3-interval-release.mjs), so they share
 * this decoder. It holds no data itself and is safe in a browser bundle.
 */

export type DecodedIntervalArea = Readonly<{
  unmappedCells: number;
  /** Running totals, so a span's summed figure is one subtraction. */
  annualLossPrefix: readonly number[];
  knownForestCellsByStartYear: readonly number[];
  unknownCellsByStartYear: readonly number[];
  /** Cumulative along the closing year, already summed out of the deltas. */
  unionLossCells: readonly number[];
}>;

export type IntervalSpanFigures = Readonly<{
  coverage: BoundaryMeasurementCoverage;
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  knownObservedSubtotalHectares: number;
  /** Annual losses added together. It has no denominator and never carries a percentage. */
  summedLossHectares: number;
  /** Set only where a small unknown share was admitted; see intervalSpanFigures. */
  admittedUnknownPercent?: number;
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const counts = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0);

/**
 * Fails closed on a record that is malformed or breaks a span invariant: the
 * forest lost at least once can exceed neither the yearly losses added
 * together nor the forest known at the span's start.
 */
export function decodeIntervalArea(candidate: unknown, label: string): DecodedIntervalArea {
  if (
    !object(candidate) ||
    typeof candidate.unmappedCells !== "number" ||
    !Number.isInteger(candidate.unmappedCells) ||
    candidate.unmappedCells < 0 ||
    !counts(candidate.annualLossCells, EXPLORE_ANNUAL_STEP_COUNT) ||
    !counts(candidate.knownForestCellsByStartYear, EXPLORE_ANNUAL_STEP_COUNT) ||
    !counts(candidate.unknownCellsByStartYear, EXPLORE_ANNUAL_STEP_COUNT) ||
    !counts(candidate.unionLossCellDeltas, EXPLORE_INTERVAL_COUNT)
  ) {
    throw new Error(`${label} has an invalid contract.`);
  }
  const annualLossPrefix = [0];
  for (const step of candidate.annualLossCells) annualLossPrefix.push(annualLossPrefix.at(-1)! + step);

  const unionLossCells: number[] = [];
  let index = 0;
  for (let start = 0; start < EXPLORE_ANNUAL_STEP_COUNT; start += 1) {
    let running = 0;
    for (let end = start; end < EXPLORE_ANNUAL_STEP_COUNT; end += 1) {
      running += candidate.unionLossCellDeltas[index];
      const summed = annualLossPrefix[end + 1] - annualLossPrefix[start];
      if (running > summed || running > candidate.knownForestCellsByStartYear[start]) {
        throw new Error(`${label} breaks a span invariant.`);
      }
      unionLossCells.push(running);
      index += 1;
    }
  }
  return {
    unmappedCells: candidate.unmappedCells,
    annualLossPrefix,
    knownForestCellsByStartYear: candidate.knownForestCellsByStartYear,
    unknownCellsByStartYear: candidate.unknownCellsByStartYear,
    unionLossCells,
  };
}

const CELL_HECTARES = 0.09;
const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;

/**
 * One span's figures for one area.
 *
 * An area reports a share of its own forest only when all of it was mapped,
 * the rule the annual product has always applied. Where part of it is unmapped
 * the observed subtotal is still reported, because withholding a number that
 * was measured is its own kind of error; what is withheld is the share, because
 * its denominator is not known.
 *
 * A caller may admit an unknown share below `unknownTolerancePercent`. The
 * share is then taken over the mapped forest alone and the admitted unknown
 * share travels with it, so the reader is told what was left out.
 */
export function intervalSpanFigures(
  area: DecodedIntervalArea,
  interval: ExploreInterval,
  unknownTolerancePercent = 0,
): IntervalSpanFigures {
  const start = interval.fromYear - EXPLORE_INTERVAL_FIRST_YEAR;
  const end = interval.toYear - EXPLORE_INTERVAL_FIRST_YEAR - 1;
  const union = area.unionLossCells[intervalWindowIndex(interval)];
  const known = area.knownForestCellsByStartYear[start];
  const unknown = area.unknownCellsByStartYear[start];
  const summed = area.annualLossPrefix[end + 1] - area.annualLossPrefix[start];
  // The unknown share as the rest of the site states it, taking the larger of
  // the two unmapped counts so the tolerance can never be met by the smaller.
  const unknownCells = Math.max(unknown, area.unmappedCells);
  const unknownPercent = known > 0 ? (unknownCells / (known + unknownCells)) * 100 : 100;
  const admitted = unknownCells > 0 && unknownPercent < unknownTolerancePercent;
  const coverage: BoundaryMeasurementCoverage =
    unknownCells > 0 && !admitted
      ? "partial-with-unknown"
      : known === 0
        ? "none-mapped"
        : "complete";
  const complete = coverage === "complete";
  return {
    coverage,
    observedLossPercent: complete ? (union / known) * 100 : null,
    observedLossHectares: complete ? hectares(union) : null,
    knownObservedSubtotalHectares: hectares(union),
    summedLossHectares: hectares(summed),
    ...(admitted ? { admittedUnknownPercent: unknownPercent } : {}),
  };
}
