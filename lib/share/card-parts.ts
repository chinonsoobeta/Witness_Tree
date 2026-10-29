/**
 * The words and colours a place's share card (lib/share/receipt.tsx) and its
 * embedded figure (lib/embed/card.ts) share beside the summary from
 * lib/place-pages/summary.ts: the fact labels, the minimum note, the licence
 * line, the preview caveat and the light palette. One copy, so the embed can
 * never word a caveat differently from the card. Holds no data and no renderer.
 */

export const CARD_TEXT = {
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

/**
 * The light palette's tokens from app/globals.css, which an image cannot read
 * as CSS variables. tests/share-receipt.test.tsx fails if they drift.
 * The embed uses them too, so the two look alike.
 */
export const RECEIPT_TOKENS = {
  ground: "#fdfcf8",
  surface2: "#f0ebe5",
  ink: "#2c2c24",
  ink2: "#4a4a40",
  muted: "#615f54",
  rule: "#ded8cf",
  accent: "#47593f",
  heroFill: "#47593f",
  heroInk: "#fdfcf8",
  tintSatellite: "#dbe6f4",
  edgeSatellite: "#3f6ea8",
  tintUnknown: "#e4e8e5",
  edgeUnknown: "#6b7670",
} as const;
