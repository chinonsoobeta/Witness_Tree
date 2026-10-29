import type { Locale } from "@/lib/domain";
import { placePagePath, type PlaceGeography } from "@/lib/place-pages/paths";

/**
 * What a place page needs to name its share card, without loading the
 * renderer (lib/share/receipt.tsx) and its image engine into the page.
 */

export const RECEIPT_SIZE = { width: 1200, height: 630 } as const;
export const RECEIPT_CONTENT_TYPE = "image/png";

const ALT = {
  en: "Share card for this place: its forest lost at least once from 1984 to 2022, or Unknown with the reason, with its coverage, unmapped share, boundary edition, data version, evidence class and licence.",
  // Draft French for the owner's review (2026-10-29).
  fr: "Carte de partage de ce lieu\u202F: sa forêt perdue au moins une fois de 1984 à 2022, ou Inconnu avec la raison, avec sa couverture, sa part non cartographiée, l’édition de la limite, la version des données, la catégorie de preuve et la licence.",
} as const;

/** The card's alt text in the locale. Next reads it once per route, so it describes the card rather than one place. */
export const receiptAlt = (locale: Locale): string => ALT[locale];

/** The card's address: the route's opengraph-image, which the place page also links as its download. */
export function receiptPath(locale: Locale, place: Readonly<{ geography: PlaceGeography; code: string }>): string {
  return `${placePagePath(locale, place.geography, place.code)}/opengraph-image`;
}
