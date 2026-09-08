/*
 * The leaf module, not the domain barrel. lib/domain/brand.ts reads the
 * coverage period from this file, so going through the barrel would close a
 * cycle and leave whichever module was entered first reading an uninitialized
 * binding. year-range.ts imports nothing but a type.
 */
import { formatYearRange, yearRange } from "../domain/year-range";
import type { ConfidenceResult, CoverageGrade, EvidenceClass, Locale, Provenance } from "../domain";
export const EXPLORE_MODES = ["forest-change", "recorded-harvest", "wildfire", "condition-recovery"] as const;
export type ExploreMode = (typeof EXPLORE_MODES)[number];
export type ExploreEvent = Readonly<{ id: string; mode: ExploreMode; year: number; coordinates: readonly [longitude: number, latitude: number]; name: Record<Locale, string>; evidence: EvidenceClass; confidence: ConfidenceResult; coverageGrade: CoverageGrade; provenance: Provenance; unknownReason?: string }>;
export type ExplorePresentation = "map" | "list";
export type ExploreDataView = "chart" | "table";
/*
 * The years the reader may select, and they are the years the record covers.
 *
 * A year on this control means one annual interval: 1985 is the change detected
 * between 1984 and 1985, and 2022 is the change between 2021 and 2022. The
 * archives hold all 38 of those intervals and no others, so 1984 is not
 * selectable (it is the first year of the first interval, not the end of one)
 * and neither is anything after 2022.
 *
 * The range used to run to 2026, which is roughly today. That offered the
 * reader four years for which nothing has been measured, and the default view
 * landed on one of them: the map opened on a year with no detected patches at
 * all. A control should not offer a year the archive cannot answer.
 */
export const EXPLORE_YEAR_MIN = 1985;
export const EXPLORE_YEAR_MAX = 2022;
export const EXPLORE_DEFAULT_YEAR = EXPLORE_YEAR_MAX;
/*
 * The whole span the archive reaches across. It is the outer bound of the 38
 * annual intervals, not an interval itself: no single layer covers it.
 */
export const EXPLORE_COVERAGE_SPAN = yearRange(EXPLORE_YEAR_MIN - 1, EXPLORE_YEAR_MAX);

/*
 * The same span in the three shapes prose needs. These were spelled out by
 * hand here and differently again in half a dozen components, which is how the
 * page came to print a hyphen, an en dash and the word "to" for one period.
 * lib/domain/year-range.ts is now the only place that decides how a range is
 * set, and this is the only place that names this particular range.
 */
export const EXPLORE_COVERAGE_PERIOD = Object.freeze({
  en: formatYearRange(EXPLORE_COVERAGE_SPAN, "en", "span"),
  fr: formatYearRange(EXPLORE_COVERAGE_SPAN, "fr", "span"),
  compact: formatYearRange(EXPLORE_COVERAGE_SPAN, "en"),
});
export const EXPLORE_MAP_VIEWS = ["bc", "ab", "on", "qc"] as const;
export type ExploreMapView = (typeof EXPLORE_MAP_VIEWS)[number];
