import type { CoverageGrade, ProvinceCode } from "../domain";
export type CoveragePeriod = Readonly<{ startYear: number; endYear: number; grade: CoverageGrade; containsPoint: boolean }>;
export type CoveragePointQuery = Readonly<{ province: ProvinceCode; latitude: number; year: number; boundaryEdition: string; periods?: readonly CoveragePeriod[] }>;
export type CoverageResult = Readonly<{ grade: CoverageGrade; boundaryEdition: string; year: number }>;
export type ForestAggregateInput = Readonly<{ detectedChangeHectares: number; forestedHectares?: number; coverageGrade: CoverageGrade; boundaryEdition: string; timeRange: string }>;
export type ForestAggregate = Readonly<{ kind: "figure"; value: number; unit: "%"; boundaryEdition: string; timeRange: string }> | Readonly<{ kind: "unknown"; reason: string; boundaryEdition: string; timeRange: string }>;
export type CoverageShare = Readonly<{ grade: CoverageGrade; forestedHectares: number }>;
