import type { CoverageGrade, EvidenceClass, Locale } from "../domain";

export const RANKABLE_PLACE_TYPES = ["federal-riding", "provincial-riding"] as const;
export const COMPARABLE_PLACE_TYPES = [
  "province", "watershed", "forest-district", "municipality", "federal-riding", "provincial-riding", "reserve", "treaty-area",
] as const;
export const RANKING_METRIC = "detected-change-share-of-forested-area" as const;

export type RankablePlaceType = (typeof RANKABLE_PLACE_TYPES)[number];
export type ComparablePlaceType = (typeof COMPARABLE_PLACE_TYPES)[number];
export type RankedRiding = Readonly<{
  id: string;
  name: Readonly<Record<Locale, string>>;
  placeType: RankablePlaceType;
  detectedChangePercent: number;
  detectedChangeHectares: number;
  forestedHectares: number;
  /** Share of the detected change with no matching official record, as a 0–100 percent like `detectedChangePercent`. Required so a rank is never readable without it. */
  unmatchedSharePercent: number;
  coverageGrade: CoverageGrade;
  evidence: EvidenceClass;
  sufficientCoverage: boolean;
}>;
export type RankingContext = Readonly<{
  timeRange: string;
  boundaryEdition: string;
  dataVersion: string;
  denominatorDefinition: Readonly<Record<Locale, string>>;
  evidence: EvidenceClass;
  method: Readonly<Record<Locale, string>>;
}>;
export type ComparisonPlace = Readonly<{
  id: string;
  name: Readonly<Record<Locale, string>>;
  placeType: ComparablePlaceType;
  detectedChangePercent: number;
  detectedChangeHectares: number;
  forestedHectares: number;
  coverageGrade: CoverageGrade;
  evidence: EvidenceClass;
}>;
