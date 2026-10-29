import type { Locale } from "../domain";
import { RANKING_METRIC, type ComparisonPlace, type RankedRiding, type RankingContext }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "./types.ts";

export type RankedRidingsResult = Readonly<{ ranked: readonly RankedRiding[]; unranked: readonly RankedRiding[] }>;
export type RankingSort = "share-desc" | "share-asc";
export const RANKING_COPY = {
  en: { metric: "Detected loss as a share of forested area", hectares: "Detected loss (ha)", forested: "Forested area (ha)", officialMatching: "Matching to official records hasn’t been done for ridings yet, so how much of each riding’s loss an official record accounts for is Unknown. The tables leave it out rather than show a column of Unknowns.", unknown: "Unknown" },
  fr: { metric: "Perte détectée en proportion de la superficie forestière", hectares: "Perte détectée (ha)", forested: "Superficie forestière (ha)", officialMatching: "L’appariement aux registres officiels n’a pas encore été fait pour les circonscriptions\u202F; la part de la perte de chaque circonscription qu’explique un registre officiel est donc inconnue. Les tableaux l’omettent plutôt que d’afficher une colonne de valeurs inconnues.", unknown: "Inconnu" },
} as const;

/** Ranked rows Compare shows before the reader asks for the whole ranking. */
export const RANKING_PREVIEW_ROWS = 20;

export function parseRankingSort(value: string | undefined): RankingSort {
  return value === "share-asc" ? "share-asc" : "share-desc";
}

export function rankRidings(rows: readonly RankedRiding[], sort: RankingSort = "share-desc"): RankedRidingsResult {
  const sufficient = rows
    .filter((row): row is RankedRiding & { detectedChangePercent: number; detectedChangeHectares: number } =>
      row.sufficientCoverage && row.detectedChangePercent !== null && row.detectedChangeHectares !== null,
    )
    .sort((a, b) => sort === "share-asc"
      ? a.detectedChangePercent - b.detectedChangePercent
      : b.detectedChangePercent - a.detectedChangePercent);
  return Object.freeze({
    ranked: sufficient,
    unranked: rows.filter((row) =>
      !row.sufficientCoverage || row.detectedChangePercent === null || row.detectedChangeHectares === null,
    ),
  });
}

export function rankingContextLines(context: RankingContext, locale: Locale): readonly string[] {
  return [context.timeRange, context.boundaryEdition, context.dataVersion, context.denominatorDefinition[locale], context.method[locale]];
}

export function comparePlaces(places: readonly ComparisonPlace[]): readonly [ComparisonPlace, ComparisonPlace] {
  if (places.length !== 2) throw new Error("Side-by-side comparison requires exactly two places.");
  // Any two ridings may sit side by side, federal or provincial; other places only with their own kind.
  const ridings = places.every((place) => place.placeType === "federal-riding" || place.placeType === "provincial-riding");
  if (!ridings && places[0].placeType !== places[1].placeType) throw new Error("Side-by-side places must have the same type.");
  return [places[0], places[1]];
}

export { RANKING_METRIC };
