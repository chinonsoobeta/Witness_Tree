// The leaf module rather than the barrel, for the reason given in ./types.
import {
  formatYearRange,
  parseYearRange,
  yearRange,
  type YearRange,
  type YearRangeForm,
} from "../domain/year-range";
import type { Locale } from "../domain/localized";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR } from "./interval";
import { EXPLORE_COVERAGE_SPAN } from "./types";
import { EXPLORE_PRODUCTION_LAYER } from "./map-style";

/*
 * Two periods are visible on the Explore page at once and they are not the
 * same span. The province aggregate covers one fixed window and ignores the
 * year control; the per-cell patches cover every annual interval and follow
 * it. Copy that hardcodes either span goes stale silently, and the aggregate's
 * span is about to move when the 1984-2022 widening lands.
 *
 * Both spans already have an authoritative field. This module is the only
 * place that reads them for a reader, so widening the aggregate changes one
 * value in map-style.ts and every sentence follows.
 */

/** The span the published province aggregate actually covers. */
export const PRODUCTION_AGGREGATE_PERIOD: YearRange = parseYearRange(
  EXPLORE_PRODUCTION_LAYER.period,
);

export function productionAggregatePeriod(
  locale: Locale,
  form: YearRangeForm = "compact",
): string {
  return formatYearRange(PRODUCTION_AGGREGATE_PERIOD, locale, form);
}

/*
 * The per-cell archive holds annual intervals only, so its coverage is stated
 * as the first interval and the last, not as one 1984-2022 span. Saying
 * "1984-2022" here would claim a single cumulative layer the archive does not
 * hold.
 */
export const FIRST_ANNUAL_INTERVAL: YearRange = yearRange(
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_FIRST_YEAR + 1,
);
export const LAST_ANNUAL_INTERVAL: YearRange = yearRange(
  EXPLORE_INTERVAL_LAST_YEAR - 1,
  EXPLORE_INTERVAL_LAST_YEAR,
);

/** "1984–1985 to 2021–2022", or the French equivalent. */
export function annualIntervalCoverage(locale: Locale): string {
  const first = formatYearRange(FIRST_ANNUAL_INTERVAL, locale);
  const last = formatYearRange(LAST_ANNUAL_INTERVAL, locale);
  return locale === "fr" ? `de ${first} à ${last}` : `${first} to ${last}`;
}

/*
 * The whole reach of the per-cell archive. It is the same span the coverage
 * label names, aliased here so copy about the archive reads as being about the
 * archive; there is deliberately only one value behind both names.
 */
export const PER_CELL_ARCHIVE_SPAN: YearRange = EXPLORE_COVERAGE_SPAN;

export function perCellArchiveSpan(locale: Locale, form: YearRangeForm = "compact"): string {
  return formatYearRange(PER_CELL_ARCHIVE_SPAN, locale, form);
}
