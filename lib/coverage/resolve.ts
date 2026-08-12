import type { CoverageGrade } from "../domain";
import type { CoveragePointQuery, CoverageResult, CoverageShare, ForestAggregate, ForestAggregateInput }
from "./types.ts";

const COVERAGE_GRADES: readonly CoverageGrade[] = ["enhanced-local-records", "national-baseline-plus-local-context", "national-baseline", "extended-record-sparse-official-matching", "not-applicable"];
const PROVINCES = ["BC", "AB", "ON", "QC"] as const;
const currentYear = () => new Date().getUTCFullYear();
const validGrade = (grade: unknown): grade is CoverageGrade => COVERAGE_GRADES.includes(grade as CoverageGrade);
const validYear = (year: unknown): year is number => typeof year === "number" && Number.isInteger(year) && year >= 1984 && year <= currentYear();

export function resolveCoverage(query: CoveragePointQuery): CoverageResult {
  if (!PROVINCES.includes(query.province)) throw new Error("A supported province is required.");
  if (!query.boundaryEdition.trim()) throw new Error("A boundary edition is required.");
  if (!Number.isFinite(query.latitude) || query.latitude < -90 || query.latitude > 90) throw new Error("Latitude must be finite and between -90 and 90.");
  if (!validYear(query.year)) throw new Error("Year must be an integer within the record period.");
  for (const period of query.periods ?? []) {
    if (!validYear(period.startYear) || !validYear(period.endYear) || period.startYear > period.endYear || typeof period.containsPoint !== "boolean" || !validGrade(period.grade)) throw new Error("Coverage period is invalid.");
  }
  if (query.province === "QC" && query.latitude >= 52) return { grade: "national-baseline", boundaryEdition: query.boundaryEdition, year: query.year };
  const matching = query.periods?.find((period) => period.containsPoint && query.year >= period.startYear && query.year <= period.endYear);
  return { grade: matching?.grade ?? (query.year < 2000 ? "extended-record-sparse-official-matching" : "national-baseline"), boundaryEdition: query.boundaryEdition, year: query.year };
}

export function aggregateDetectedChange(input: ForestAggregateInput): ForestAggregate {
  if (!input.boundaryEdition.trim() || !input.timeRange.trim()) throw new Error("Boundary edition and time range are required.");
  if (!Number.isFinite(input.detectedChangeHectares) || (input.forestedHectares !== undefined && !Number.isFinite(input.forestedHectares)) || !validGrade(input.coverageGrade)) throw new Error("Finite hectares and a registered coverage grade are required.");
  if (input.detectedChangeHectares < 0 || (input.forestedHectares !== undefined && input.forestedHectares < 0)) throw new Error("Hectares must be non-negative.");
  if (!input.forestedHectares || input.coverageGrade === "not-applicable" || input.coverageGrade === "extended-record-sparse-official-matching") return { kind: "unknown", reason: "No sufficient forested-hectare denominator is available for this coverage.", boundaryEdition: input.boundaryEdition, timeRange: input.timeRange };
  if (input.detectedChangeHectares > input.forestedHectares) throw new Error("Detected change cannot exceed forested hectares.");
  return { kind: "figure", value: input.detectedChangeHectares / input.forestedHectares * 100, unit: "%", boundaryEdition: input.boundaryEdition, timeRange: input.timeRange };
}

export function coverageShares(shares: readonly CoverageShare[]): Readonly<Record<CoverageGrade, number>> {
  if (shares.some((item) => !Number.isFinite(item.forestedHectares) || item.forestedHectares < 0 || !validGrade(item.grade))) throw new Error("Coverage shares require registered grades and finite, non-negative forested hectares.");
  const total = shares.reduce((sum, item) => sum + item.forestedHectares, 0);
  if (total <= 0) throw new Error("Coverage shares require positive forested hectares.");
  const result = {} as Record<CoverageGrade, number>;
  for (const share of shares) result[share.grade] = (result[share.grade] ?? 0) + share.forestedHectares / total;
  const sum = Object.values(result).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-12) throw new Error("Coverage shares must sum to one.");
  return result;
}
