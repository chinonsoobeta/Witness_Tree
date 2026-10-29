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

/**
 * The card's own labels and caveat lines. They live here, apart from the
 * renderer, so the print sheet (components/places/RidingSheet.tsx) prints the
 * card's facts in the same words without loading the image engine.
 */
export const RECEIPT_COPY = {
  en: {
    years: "Years",
    span: "1984–2022",
    coverage: "Coverage",
    unmapped: "Unmapped share",
    edition: "Boundary edition",
    dataVersion: "Data version",
    evidence: "Evidence",
    share: "of the forest mapped in 1984",
    shareUnknown: "Share Unknown",
    minimum: "A minimum: only the part of the forest with satellite data is counted.",
    licence: "Contains information licensed under the Open Government Licence – Canada (Natural Resources Canada, VLCE2). No endorsement is implied.",
    preview: "Preview figures: not expert reviewed, not a formal release.",
  },
  // French strings are Claude's drafts awaiting the owner's review (2026-10-29).
  fr: {
    years: "Années",
    span: "1984–2022",
    coverage: "Couverture",
    unmapped: "Part non cartographiée",
    edition: "Édition de la limite",
    dataVersion: "Version des données",
    evidence: "Preuve",
    share: "de la forêt cartographiée en 1984",
    shareUnknown: "Part inconnue",
    minimum: "Un minimum\u202F: seule la partie de la forêt couverte par des données satellitaires est comptée.",
    licence: "Contient de l’information visée par la Licence du gouvernement ouvert – Canada (Ressources naturelles Canada, VLCE2). Aucune approbation n’est sous-entendue.",
    preview: "Chiffres préliminaires\u202F: non examinés par des experts, pas une publication officielle.",
  },
} as const;
