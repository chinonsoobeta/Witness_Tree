import type { Locale } from "@/lib/domain/localized";
import { communityPagePath, placePagePath, ridingPagePath } from "@/lib/place-pages/paths";
import type { BoundarySelection } from "./boundary-readout";

/**
 * The place page for a boundary picked on the map (D3).
 *
 * A boundary has a page exactly when the record measures it: a riding or an
 * economic region the server sends a measurement row for (federal ridings
 * outside the four provinces get no row and no page), and a city or town in
 * the census-subdivision figure files, which hold the same 2,291 places the
 * place pages are built from. The caller says whether the boundary is
 * measured; this only builds the address, with the helpers in
 * lib/place-pages/paths.ts. Watersheds are drawn for reference and have no
 * page. tests/explore-place-links.test.ts checks every measured boundary
 * against the place-page records.
 */

export const boundarySelectionKey = (boundary: Pick<BoundarySelection, "overlay" | "jurisdiction" | "boundaryId">) =>
  `${boundary.overlay}:${boundary.jurisdiction}:${boundary.boundaryId}`;

export function boundaryPlacePagePath(
  locale: Locale,
  boundary: Pick<BoundarySelection, "overlay" | "boundaryId">,
  measured: boolean,
): string | null {
  if (!measured) return null;
  switch (boundary.overlay) {
    case "federal-ridings":
    case "provincial-ridings":
      return ridingPagePath(locale, boundary.boundaryId);
    case "economic-regions": {
      const match = /^CA-2021S0500(\d{4})$/.exec(boundary.boundaryId);
      return match ? placePagePath(locale, "er-2021", match[1]) : null;
    }
    case "census-subdivisions": {
      const match = /^CA-(\d{7})$/.exec(boundary.boundaryId);
      return match ? communityPagePath(locale, match[1]) : null;
    }
    default:
      return null;
  }
}
