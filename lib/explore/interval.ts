import { CELL_HECTARES } from "../domain/loss-vocabulary";
import { EXPLORE_YEAR_MAX, EXPLORE_YEAR_MIN } from "./types";

/*
 * The reader selects a span, not a year.
 *
 * The single-year control answers one annual interval: 1995 means what changed
 * between 1994 and 1995. A reader who wants 1990 to 1998 is asking a different
 * question, and there are two honest answers to it, which is why this module
 * keeps them apart by construction rather than by convention.
 *
 * The annual view is not a separate mode. It is the span whose end year is one
 * past its start, so every existing link keeps working and there is one code
 * path rather than two that must be kept in agreement.
 */

/** The first year of the record. It is a start year only: no interval ends there. */
export const EXPLORE_INTERVAL_FIRST_YEAR = EXPLORE_YEAR_MIN - 1;
export const EXPLORE_INTERVAL_LAST_YEAR = EXPLORE_YEAR_MAX;

/** 38 annual steps, so 38 * 39 / 2 spans a reader can ask for. */
export const EXPLORE_ANNUAL_STEP_COUNT = EXPLORE_INTERVAL_LAST_YEAR - EXPLORE_INTERVAL_FIRST_YEAR;
export const EXPLORE_INTERVAL_COUNT =
  (EXPLORE_ANNUAL_STEP_COUNT * (EXPLORE_ANNUAL_STEP_COUNT + 1)) / 2;

export type ExploreInterval = Readonly<{ fromYear: number; toYear: number }>;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Read a span out of the query string, and never return one the record cannot
 * answer.
 *
 * A reversed span is ordered rather than rejected: a reader who drags the end
 * handle past the start meant a span, and refusing it would be pedantry. A span
 * of zero length is widened to the annual interval ending at that year, because
 * "1998 to 1998" names no interval at all and the nearest thing the reader can
 * have meant is the one year ending there.
 */
export function parseExploreInterval(
  fromValue: string | number | undefined,
  toValue: string | number | undefined,
): ExploreInterval {
  const toParsed = Number(toValue);
  const toYear = clamp(
    Number.isFinite(toParsed) ? Math.trunc(toParsed) : EXPLORE_YEAR_MAX,
    EXPLORE_YEAR_MIN,
    EXPLORE_INTERVAL_LAST_YEAR,
  );
  const fromParsed = Number(fromValue);
  const fromYear = clamp(
    Number.isFinite(fromParsed) ? Math.trunc(fromParsed) : toYear - 1,
    EXPLORE_INTERVAL_FIRST_YEAR,
    EXPLORE_INTERVAL_LAST_YEAR - 1,
  );
  if (fromYear >= toYear) {
    const ordered = clamp(toYear, EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR - 1);
    return { fromYear: Math.min(ordered, fromYear), toYear: Math.max(toYear, Math.min(ordered, fromYear) + 1) };
  }
  return { fromYear, toYear };
}

/** True when the span is one annual step, which is what the old year control selected. */
export function isAnnualInterval(interval: ExploreInterval): boolean {
  return interval.toYear === interval.fromYear + 1;
}

/** How many annual steps the span covers. Always at least one. */
export function intervalStepCount(interval: ExploreInterval): number {
  return interval.toYear - interval.fromYear;
}

/**
 * Where this span sits in the aggregate's packed arrays.
 *
 * The aggregate emits one number per span in a fixed order: every span starting
 * at 1984 in end-year order, then every span starting at 1985, and so on. The
 * order is duplicated here rather than shipped as a lookup table because a
 * table of 741 pairs is 741 chances for the two sides to disagree silently,
 * where an arithmetic identity either matches the producer or does not, and a
 * test can say which.
 */
export function intervalWindowIndex(interval: ExploreInterval): number {
  const start = interval.fromYear - EXPLORE_INTERVAL_FIRST_YEAR;
  const end = interval.toYear - EXPLORE_YEAR_MIN;
  if (start < 0 || end < start || end >= EXPLORE_ANNUAL_STEP_COUNT) return -1;
  return start * EXPLORE_ANNUAL_STEP_COUNT - (start * (start - 1)) / 2 + (end - start);
}

/** The inverse, used by tests and by anything that walks the packed arrays. */
export function intervalAtWindowIndex(index: number): ExploreInterval | null {
  if (!Number.isInteger(index) || index < 0 || index >= EXPLORE_INTERVAL_COUNT) return null;
  let remaining = index;
  for (let start = 0; start < EXPLORE_ANNUAL_STEP_COUNT; start += 1) {
    const width = EXPLORE_ANNUAL_STEP_COUNT - start;
    if (remaining < width) {
      return {
        fromYear: EXPLORE_INTERVAL_FIRST_YEAR + start,
        toYear: EXPLORE_YEAR_MIN + start + remaining,
      };
    }
    remaining -= width;
  }
  return null;
}

/**
 * One district's answer for one span.
 *
 * `summedLossPercent` is absent, and its absence is the point. A cell lost in
 * 1991 and again in 1995 contributes 0.09 ha twice to the sum inside a cell
 * that is 0.09 ha, so the sum has no denominator that means anything. Leaving
 * the field out means the mistake is a type error rather than a plausible
 * looking number on a page.
 */
export type IntervalMeasurement = Readonly<{
  fromYear: number;
  toYear: number;
  knownForestedHectares: number | null;
  unionLossHectares: number | null;
  unionLossPercent: number | null;
  summedLossHectares: number | null;
  unknownHectares: number | null;
}>;

/** The packed arrays one district carries, in the order intervalWindowIndex names. */
export type IntervalDistrictAggregate = Readonly<{
  boundaryId: string;
  boundaryName: string | null;
  intervalKnownCells: readonly number[];
  intervalUnionLossCells: readonly number[];
  intervalUnknownCells: readonly number[];
  intervalSummedLossCells: readonly number[];
}>;

const hectares = (cells: number | undefined) =>
  typeof cells === "number" && Number.isFinite(cells) ? cells * CELL_HECTARES : null;

/**
 * Read one span out of a district aggregate.
 *
 * Every field returns null rather than zero when the aggregate cannot answer.
 * A district with no known forest in the start year has no denominator, so the
 * percentage is Unknown, not 0 percent: a zero there would read as "nothing was
 * lost" when what happened is that nobody could tell.
 */
export function intervalMeasurement(
  district: IntervalDistrictAggregate,
  interval: ExploreInterval,
): IntervalMeasurement | null {
  const index = intervalWindowIndex(interval);
  if (index < 0) return null;
  const knownCells = district.intervalKnownCells[index];
  const unionCells = district.intervalUnionLossCells[index];
  if (typeof knownCells !== "number" || typeof unionCells !== "number") return null;
  const known = hectares(knownCells);
  const union = hectares(unionCells);
  return {
    fromYear: interval.fromYear,
    toYear: interval.toYear,
    knownForestedHectares: known,
    unionLossHectares: union,
    unionLossPercent: known !== null && union !== null && knownCells > 0 ? (union / known) * 100 : null,
    summedLossHectares: hectares(district.intervalSummedLossCells[index]),
    unknownHectares: hectares(district.intervalUnknownCells[index]),
  };
}
