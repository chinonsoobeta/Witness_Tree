import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { PLACE_DATA_VERSION, PLACE_GEOGRAPHIES, placePagePath, type PlaceGeography } from "@/lib/place-pages/paths";
import { SITE_ORIGIN } from "@/lib/site-metadata";

/**
 * Addresses and the iframe snippet of a place's embedded figure (feature plan
 * item 3). Holds no data, so the place page and the oEmbed endpoint can name an
 * embed without loading a record.
 *
 * The embed mirrors the place page's segments, so a figure's data version and
 * boundary edition are in its address too, and never the product name:
 *
 *     /en/embed/1984-2022-v1/csd-2021/5924034
 *     /fr/integrer/1984-2022-v1/csd-2021/5924034
 */

const EMBED_ROOT = { en: "/en/embed", fr: "/fr/integrer" } as const;
const PLACE_ROOT = { en: "/en/places", fr: "/fr/lieux" } as const;

/**
 * The frame the snippet asks for. At this size the card shows every line, the
 * attribution and licence included; in a smaller frame it scrolls inside the
 * frame rather than losing a line.
 */
export const EMBED_SIZE = { width: 560, height: 560 } as const;
export const EMBED_MIN_WIDTH = 280;

export function embedPath(locale: Locale, geography: PlaceGeography, code: string): string {
  return `${EMBED_ROOT[locale]}/${PLACE_DATA_VERSION}/${geography}/${encodeURIComponent(code)}`;
}

const TITLE = {
  en: (name: string) => `Forest lost in ${name}, 1984–2022 (${PRODUCT_NAME.en})`,
  // Draft French for the owner's review (2026-10-29).
  fr: (name: string) => `Forêt perdue à ${name}, 1984–2022 (${PRODUCT_NAME.fr})`,
} as const;

/** The frame's accessible name, which a screen reader announces before entering it. */
export function embedTitle(locale: Locale, name: string): string {
  return TITLE[locale](name);
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The iframe a site pastes, in the place page's block and in the oEmbed answer. */
export function embedSnippet(
  locale: Locale,
  place: Readonly<{ geography: PlaceGeography; code: string; name: string }>,
  size: Readonly<{ width: number; height: number }> = EMBED_SIZE,
): string {
  const src = `${SITE_ORIGIN}${embedPath(locale, place.geography, place.code)}`;
  return `<iframe src="${escapeHtml(src)}" title="${escapeHtml(embedTitle(locale, place.name))}" width="${size.width}" height="${size.height}" style="border:0;max-width:100%" loading="lazy"></iframe>`;
}

/** The oEmbed answer for a place page, named in that page's head for discovery. */
export function oembedDiscoveryPath(locale: Locale, geography: PlaceGeography, code: string): string {
  const page = `${SITE_ORIGIN}${placePagePath(locale, geography, code)}`;
  return `/api/oembed?${new URLSearchParams({ url: page, format: "json" })}`;
}

export type PlaceAddress =Readonly<{ locale: Locale; dataVersion: string; geography: PlaceGeography; code: string }>;

/**
 * The place a page address names, or null when it is not a place page address:
 * `/en/places/<version>/<geography>/<code>` or `/fr/lieux/...`, with nothing
 * after the code. It does not say whether that place exists.
 */
export function parsePlacePath(pathname: string): PlaceAddress | null {
  const parts = pathname.replace(/\/$/, "").split("/");
  if (parts.length !== 6 || parts[0] !== "") return null;
  const [, localeSegment, root, dataVersion, geography, encoded] = parts as [string, string, string, string, string, string];
  const locale = localeSegment === "en" || localeSegment === "fr" ? localeSegment : null;
  if (!locale || `/${locale}/${root}` !== PLACE_ROOT[locale]) return null;
  if (!(PLACE_GEOGRAPHIES as readonly string[]).includes(geography)) return null;
  let code: string;
  try {
    code = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!code) return null;
  return { locale, dataVersion, geography: geography as PlaceGeography, code };
}
