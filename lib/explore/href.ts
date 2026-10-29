import { BOUNDARY_OVERLAYS, BOUNDARY_OVERLAY_IDS, parseBoundaryOverlays, serializeBoundaryOverlays } from "./boundaries";
import type { BoundaryOverlayId } from "./boundaries";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR, type ExploreInterval } from "./interval";
import { EXPLORE_DEFAULT_YEAR, EXPLORE_MODES, EXPLORE_YEAR_MIN } from "./types";
import type { ExploreDataView, ExploreMode, ExplorePresentation } from "./types";

/** Everything the Explore route reads out of the query string. */
export type ExploreQueryState = Readonly<{
  mode: ExploreMode;
  presentation: ExplorePresentation;
  data: ExploreDataView;
  /** The end of the selected span. Kept named `year` because it is the same parameter it always was. */
  year: number;
  /**
   * The start of the selected span. Absent means the annual interval ending at
   * `year`, which is what a bare `?year=` has always meant, so every link and
   * bookmark written before spans existed still selects exactly what it did.
   */
  fromYear?: number;
  overlays?: readonly BoundaryOverlayId[];
}>;

/**
 * The Explore query string, built in one place.
 *
 * The view is driven entirely by these parameters plus the overlay list, so
 * every control on the page is a link to a different value of the same state.
 * It is shared with the year control, which has to build the same URL from the
 * browser in order to step through the years without a full page load: two
 * copies of this format would eventually disagree, and the disagreement would
 * show up as a control that silently drops the reader's other choices.
 *
 * `from` is written only when the span is wider than one year. A URL that says
 * nothing about the start year is not ambiguous, it is the annual interval, and
 * emitting a redundant `from=1994&year=1995` on every link would churn every
 * existing test and bookmark to say what the default already says.
 */
export function exploreHref({
  mode,
  presentation,
  data,
  year,
  fromYear,
  overlays = [],
}: ExploreQueryState): string {
  const base = `?mode=${mode}&presentation=${presentation}&data=${data}&year=${year}`;
  const span = fromYear !== undefined && fromYear !== year - 1 ? `&from=${fromYear}` : "";
  return overlays.length === 0
    ? `${base}${span}`
    : `${base}${span}&overlays=${serializeBoundaryOverlays(overlays)}`;
}

/**
 * A value in the address that the page could not use, and why.
 *
 * The page never quietly shows something other than what a link asked for:
 * each of these is printed to the reader beside what is shown instead. An
 * inverted span names both of its years, because neither is wrong on its own.
 */
export type IgnoredQueryValue =
  | Readonly<{ parameter: string; value: string; reason: "malformed" | "out-of-range" | "unknown" }>
  | Readonly<{ parameter: string; value: string; reason: "inverted"; lastYear: string }>;

const QUOTE_LIMIT = 16;

/**
 * An address value as the page may repeat it. Long enough to recognise a typo,
 * short enough that a crafted link cannot write a sentence of its own onto the
 * page. React escapes it; this only bounds its length.
 */
export function quotedQueryValue(value: string): string {
  const characters = Array.from(value);
  return characters.length > QUOTE_LIMIT ? `${characters.slice(0, QUOTE_LIMIT).join("")}…` : value;
}

/** A repeated parameter arrives as a list; read it as the one string it is in the address. */
export function queryText(value: string | readonly string[] | undefined): string | undefined {
  const text = typeof value === "string" ? value : value?.join(",");
  // An empty value names nothing, the same as an absent one.
  return text === "" ? undefined : text;
}

const FOUR_DIGIT_YEAR = /^[0-9]{4}$/;

/** Null when the value is a four-digit year inside the bounds, otherwise why it is not. */
export function queryYearProblem(
  parameter: string,
  value: string,
  low: number,
  high: number,
): IgnoredQueryValue | null {
  if (!FOUR_DIGIT_YEAR.test(value)) return { parameter, value, reason: "malformed" };
  const year = Number(value);
  return year < low || year > high ? { parameter, value, reason: "out-of-range" } : null;
}

export type ExploreRouteQuery = Readonly<
  Partial<Record<"mode" | "year" | "from" | "overlays", string | readonly string[]>>
>;

/** The span Explore opens at when a link names none, or names one it cannot show. */
export const EXPLORE_DEFAULT_INTERVAL: ExploreInterval = {
  fromYear: EXPLORE_DEFAULT_YEAR - 1,
  toYear: EXPLORE_DEFAULT_YEAR,
};

/**
 * The Explore route's state, read strictly from its address.
 *
 * `year` is the last year (1985 to 2022) and `from` the first (1984 to 2021);
 * a link naming only `year` still means the annual interval ending there, and
 * one naming only `from` runs to the end of the record. A year that is not
 * four ASCII digits, falls outside those bounds, or does not come before the
 * last year is not guessed at: the page opens at the default span and lists
 * what it ignored. So does a view or a boundary layer the page does not have.
 * The selects only ever produce valid spans, so this fires for a link that was
 * typed, truncated or edited.
 */
export function readExploreQuery(query: ExploreRouteQuery): Readonly<{
  mode: ExploreMode;
  interval: ExploreInterval;
  overlays: readonly BoundaryOverlayId[];
  ignored: readonly IgnoredQueryValue[];
}> {
  const ignored: IgnoredQueryValue[] = [];

  const modeText = queryText(query.mode);
  const mode = EXPLORE_MODES.find((item) => item === modeText) ?? "forest-change";
  if (modeText !== undefined && mode !== modeText) {
    ignored.push({ parameter: "mode", value: modeText, reason: "unknown" });
  }

  const fromText = queryText(query.from);
  const yearText = queryText(query.year);
  const yearProblems = [
    fromText === undefined
      ? null
      : queryYearProblem("from", fromText, EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR - 1),
    yearText === undefined
      ? null
      : queryYearProblem("year", yearText, EXPLORE_YEAR_MIN, EXPLORE_INTERVAL_LAST_YEAR),
  ].filter((problem) => problem !== null);
  let interval = EXPLORE_DEFAULT_INTERVAL;
  if (yearProblems.length > 0) {
    ignored.push(...yearProblems);
  } else {
    const toYear = yearText === undefined ? EXPLORE_DEFAULT_YEAR : Number(yearText);
    const fromYear = fromText === undefined ? toYear - 1 : Number(fromText);
    if (fromYear < toYear) interval = { fromYear, toYear };
    else ignored.push({ parameter: "from", value: String(fromYear), reason: "inverted", lastYear: String(toYear) });
  }

  const overlaysText = queryText(query.overlays);
  for (const part of overlaysText?.split(",").map((item) => item.trim()).filter(Boolean) ?? []) {
    const known = BOUNDARY_OVERLAY_IDS.find((id) => id === part);
    if (!known || !BOUNDARY_OVERLAYS[known].available) {
      ignored.push({ parameter: "overlays", value: part, reason: "unknown" });
    }
  }

  return { mode, interval, overlays: parseBoundaryOverlays(overlaysText), ignored };
}
