import type { Locale } from "../domain";
import { RANKING_METRIC, type ComparisonPlace, type RankedRiding, type RankingContext }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "./types.ts";

export type RankedRidingsResult = Readonly<{ ranked: readonly RankedRiding[]; insufficientCoverage: readonly RankedRiding[] }>;
export type RankingSort = "share-desc" | "share-asc";
export const RANKING_COPY = {
  en: { metric: "Detected change as a share of forested area", insufficient: "Insufficient coverage, not ranked", hectares: "Detected change (ha)", forested: "Forested area (ha)", officialMatching: "Official matching: no district-level official matching run has been admitted, so this value is Unknown for every row.", unknown: "Unknown" },
  fr: { metric: "Changement détecté en part de la superficie forestière", insufficient: "Couverture insuffisante, non classée", hectares: "Changement détecté (ha)", forested: "Superficie forestière (ha)", officialMatching: "Appariement officiel : aucun appariement officiel au niveau des circonscriptions n’a été admis. Cette valeur est donc inconnue pour chaque ligne.", unknown: "Inconnu" },
} as const;

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
    insufficientCoverage: rows.filter((row) =>
      !row.sufficientCoverage || row.detectedChangePercent === null || row.detectedChangeHectares === null,
    ),
  });
}

export function rankingContextLines(context: RankingContext, locale: Locale): readonly string[] {
  return [context.timeRange, context.boundaryEdition, context.dataVersion, context.denominatorDefinition[locale], context.method[locale]];
}

export function comparePlaces(places: readonly ComparisonPlace[]): readonly [ComparisonPlace, ComparisonPlace] {
  if (places.length !== 2) throw new Error("Side-by-side comparison requires exactly two places.");
  if (places[0].placeType !== places[1].placeType) throw new Error("Side-by-side places must have the same type.");
  return [places[0], places[1]];
}

export { RANKING_METRIC };
