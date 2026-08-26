import type { CoverageGrade, ForestDenominator, LocalizedString, ProvinceCode } from "../domain";
export type Position = readonly [longitude: number, latitude: number];
export type LinearRing = readonly Position[];
export type PolygonGeometry = Readonly<{ type: "Polygon"; coordinates: readonly LinearRing[] }>;
export type MultiPolygonGeometry = Readonly<{ type: "MultiPolygon"; coordinates: readonly (readonly LinearRing[])[] }>;
export type CoverageGeometry = PolygonGeometry | MultiPolygonGeometry;
export type CoverageFeature = Readonly<{
  id: string;
  boundaryEdition: string;
  startYear: number;
  endYear: number;
  grade: CoverageGrade;
  geometry: CoverageGeometry;
  priority?: number;
}>;
export type CoveragePointQuery = Readonly<{
  province: ProvinceCode;
  longitude: number;
  latitude: number;
  year: number;
  boundaryEdition: string;
  features?: readonly CoverageFeature[];
}>;
export type CoverageResult = Readonly<{ grade: CoverageGrade; boundaryEdition: string; year: number }>;
export type AggregateTimeRange = Readonly<{ from: number; to: number }>;
export type BoundaryApplicationBasis = "period-contemporaneous" | "current-applied-to-historic";
export type ForestAggregateInput = Readonly<{ detectedChangeHectares: number; denominator?: ForestDenominator; coverageGrade: CoverageGrade; timeRange: AggregateTimeRange; boundaryApplication: BoundaryApplicationBasis }>;
export type ForestAggregate =
  | Readonly<{ kind: "figure"; value: number; unit: "%"; denominator: ForestDenominator; coverageGrade: CoverageGrade; timeRange: AggregateTimeRange; boundaryApplication: BoundaryApplicationBasis }>
  | Readonly<{ kind: "unknown"; reason: LocalizedString; boundaryEdition: string; coverageGrade: CoverageGrade; timeRange: AggregateTimeRange; boundaryApplication: BoundaryApplicationBasis }>;
export type CoverageShare = Readonly<{ grade: CoverageGrade; forestedHectares: number }>;
