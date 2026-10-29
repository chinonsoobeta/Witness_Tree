import type { Locale } from "@/lib/domain/localized";

/**
 * Addresses of the place pages. Holds no data, so search can link to a page
 * without pulling any record into the browser.
 *
 * A page address carries the data version and the geography, never the product
 * name (plan section 1.4), so a citation survives a rename:
 *
 *     /en/places/1984-2022-v1/csd-2021/5924034
 *     /fr/lieux/1984-2022-v1/federal-2023/59001
 *
 * The data version is the 1984 to 2022 record measured by method
 * interval-union-and-sum-1984-2022-v1; lib/place-pages refuses to build a page
 * from a record measured by any other method. The geography is the boundary
 * layer and its edition, and the last segment is the publisher's own code: the
 * Statistics Canada census subdivision or economic region code, the Elections
 * Canada district number, or the provincial authority's district number.
 */

export const PLACE_DATA_VERSION = "1984-2022-v1";
export const PLACE_METHOD_VERSION = `interval-union-and-sum-${PLACE_DATA_VERSION}`;

export const PLACE_GEOGRAPHIES = ["csd-2021", "er-2021", "federal-2023", "bc-2023", "ab-2019", "on-2022", "qc-2026"] as const;
export type PlaceGeography = (typeof PLACE_GEOGRAPHIES)[number];

const ROOT = { en: "/en/places", fr: "/fr/lieux" } as const;

/** The jurisdiction prefix of a riding id in search (CA-59001, BC-258), and the layer it names. */
const RIDING_GEOGRAPHY: Readonly<Record<string, PlaceGeography>> = {
  CA: "federal-2023",
  BC: "bc-2023",
  AB: "ab-2019",
  ON: "on-2022",
  QC: "qc-2026",
};

export function placePagePath(locale: Locale, geography: PlaceGeography, code: string): string {
  return `${ROOT[locale]}/${PLACE_DATA_VERSION}/${geography}/${encodeURIComponent(code)}`;
}

/** The page for a riding named as search names it, such as `CA-59001` or `BC-258`. */
export function ridingPagePath(locale: Locale, ridingId: string): string | null {
  const separator = ridingId.indexOf("-");
  const geography = RIDING_GEOGRAPHY[ridingId.slice(0, separator)];
  return separator > 0 && geography ? placePagePath(locale, geography, ridingId.slice(separator + 1)) : null;
}

/** The page for a census subdivision, by its seven-digit code. */
export function communityPagePath(locale: Locale, csdCode: string): string {
  return placePagePath(locale, "csd-2021", csdCode);
}
