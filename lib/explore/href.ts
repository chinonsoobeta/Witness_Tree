import { serializeBoundaryOverlays } from "./boundaries";
import type { BoundaryOverlayId } from "./boundaries";
import type { ExploreDataView, ExploreMode, ExplorePresentation } from "./types";

/** Everything the Explore route reads out of the query string. */
export type ExploreQueryState = Readonly<{
  mode: ExploreMode;
  presentation: ExplorePresentation;
  data: ExploreDataView;
  year: number;
  overlays?: readonly BoundaryOverlayId[];
}>;

/**
 * The Explore query string, built in one place.
 *
 * The view is driven entirely by these four parameters plus the overlay list, so
 * every control on the page is a link to a different value of the same state.
 * It is shared with the year control, which has to build the same URL from the
 * browser in order to step through the years without a full page load: two
 * copies of this format would eventually disagree, and the disagreement would
 * show up as a control that silently drops the reader's other choices.
 */
export function exploreHref({ mode, presentation, data, year, overlays = [] }: ExploreQueryState): string {
  const base = `?mode=${mode}&presentation=${presentation}&data=${data}&year=${year}`;
  return overlays.length === 0 ? base : `${base}&overlays=${serializeBoundaryOverlays(overlays)}`;
}
