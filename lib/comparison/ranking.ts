import type { Locale } from "../domain";
import { RANKING_METRIC, type ComparisonPlace, type RankedRiding, type RankingContext }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "./types.ts";

export type RankedRidingsResult = Readonly<{ ranked: readonly RankedRiding[]; insufficientCoverage: readonly RankedRiding[] }>;
export const RANKING_COPY = {
  en: { metric: "Detected change as a share of forested area", insufficient: "Insufficient coverage — not ranked", hectares: "Detected change (ha)", forested: "Forested area (ha)" },
  fr: { metric: "Changement détecté en part de la superficie forestière", insufficient: "Couverture insuffisante — non classée", hectares: "Changement détecté (ha)", forested: "Superficie forestière (ha)" },
} as const;

export function rankRidings(rows: readonly RankedRiding[]): RankedRidingsResult {
  const sufficient = rows.filter((row) => row.sufficientCoverage).sort((a, b) => b.detectedChangePercent - a.detectedChangePercent);
  return Object.freeze({ ranked: sufficient, insufficientCoverage: rows.filter((row) => !row.sufficientCoverage) });
}

export function rankingContextLines(context: RankingContext, locale: Locale): readonly string[] {
  return [context.timeRange, context.boundaryEdition, boundaryApplicationLabel(context, locale), context.dataVersion, context.denominatorDefinition[locale], context.method[locale]];
}

export function boundaryApplicationLabel(context: RankingContext, locale: Locale): string {
  return context.boundaryApplication === "period-contemporaneous"
    ? (locale === "en" ? "Boundary contemporaneous with the period" : "Limite contemporaine de la période")
    : (locale === "en" ? "Current boundary applied to historic events" : "Limite actuelle appliquée aux événements historiques");
}

export function comparePlaces(places: readonly ComparisonPlace[], acknowledgeBoundaryMismatch = false): readonly [ComparisonPlace, ComparisonPlace] {
  if (places.length !== 2) throw new Error("Side-by-side comparison requires exactly two places.");
  if (places[0].placeType !== places[1].placeType) throw new Error("Side-by-side places must have the same type.");
  const mismatch = places[0].boundaryEdition !== places[1].boundaryEdition || places[0].boundaryApplication !== places[1].boundaryApplication;
  if (mismatch && !acknowledgeBoundaryMismatch) throw new Error("Cross-edition comparison requires an acknowledged boundary warning.");
  return [places[0], places[1]];
}

export { RANKING_METRIC };
