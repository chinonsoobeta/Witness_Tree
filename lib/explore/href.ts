import { serializeBoundaryOverlays } from "./boundaries";
import type { BoundaryOverlayId } from "./boundaries";
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
