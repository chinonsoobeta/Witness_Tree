import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

export const comparisonContext: RankingContext = {
  timeRange: "2000–2024", boundaryEdition: "2023 Representation Order", dataVersion: "illustrative-1", evidence: "satellite-observation",
  denominatorDefinition: { en: "Share of forested hectares at the first year of the range.", fr: "Part des hectares forestiers de la première année de la période." },
  method: { en: "Rows are ordered by detected change as a share of forested area.", fr: "Les lignes sont ordonnées selon le changement détecté en part de la superficie forestière." },
};
export const rankedRidingFixtures: readonly RankedRiding[] = [
  { id: "r1", name: { en: "Example North", fr: "Exemple Nord" }, placeType: "federal-riding", detectedChangePercent: 4.2, detectedChangeHectares: 420, forestedHectares: 10000, unmatchedSharePercent: 35, coverageGrade: "national-baseline", evidence: "satellite-observation", sufficientCoverage: true },
  { id: "r2", name: { en: "Example South", fr: "Exemple Sud" }, placeType: "federal-riding", detectedChangePercent: 2.1, detectedChangeHectares: 105, forestedHectares: 5000, unmatchedSharePercent: 5, coverageGrade: "enhanced-local-records", evidence: "satellite-observation", sufficientCoverage: true },
  { id: "r3", name: { en: "Example Sparse", fr: "Exemple limité" }, placeType: "federal-riding", detectedChangePercent: 8, detectedChangeHectares: 80, forestedHectares: 1000, unmatchedSharePercent: 100, coverageGrade: "not-applicable", evidence: "unknown", sufficientCoverage: false },
];
export const comparisonFixtures: readonly ComparisonPlace[] = rankedRidingFixtures.slice(0, 2);
