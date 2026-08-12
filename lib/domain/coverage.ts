import { localized, type LocalizedString } from "./localized";

export const COVERAGE_GRADES = [
  "enhanced-local-records",
  "national-baseline-plus-local-context",
  "national-baseline",
  "extended-record-sparse-official-matching",
  "not-applicable",
] as const;

export type CoverageGrade = (typeof COVERAGE_GRADES)[number];
export type ProvinceCode = "BC" | "AB" | "ON" | "QC";

export const COVERAGE_LABELS: Record<CoverageGrade, LocalizedString> = {
  "enhanced-local-records": localized("Enhanced local records", "Registres locaux enrichis"),
  "national-baseline-plus-local-context": localized(
    "National baseline plus local context",
    "Référence nationale avec contexte local",
  ),
  "national-baseline": localized("National baseline", "Référence nationale"),
  "extended-record-sparse-official-matching": localized(
    "Extended record, sparse official matching",
    "Registre prolongé, appariement officiel limité",
  ),
  "not-applicable": localized("Not applicable", "Sans objet"),
};

export type CoverageQuery = Readonly<{
  province: ProvinceCode;
  latitude: number;
  observationYear: number;
  enhancedCoveragePolygonContainsPoint: boolean;
  localContextAvailable?: boolean;
}>;

export function coverageGradeForPoint(query: CoverageQuery): CoverageGrade {
  if (query.observationYear < 2000) return "extended-record-sparse-official-matching";
  // The plan explicitly fixes this limit even before a detailed coverage polygon is available.
  if (query.province === "QC" && query.latitude >= 52) return "national-baseline";
  if (query.enhancedCoveragePolygonContainsPoint) return "enhanced-local-records";
  if (query.localContextAvailable) return "national-baseline-plus-local-context";
  return "national-baseline";
}
