import { localized, type LocalizedString } from "./localized";

export const COVERAGE_GRADES = [
  "enhanced-local-records",
  "national-baseline-plus-local-context",
  "national-baseline",
  "extended-record-sparse-official-matching",
  "not-applicable",
] as const;

export type CoverageGrade = (typeof COVERAGE_GRADES)[number];
/** Canadian provinces and territories; coverage fixtures remain illustrative. */
export const CANADIAN_JURISDICTION_CODES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
] as const;
export type ProvinceCode = (typeof CANADIAN_JURISDICTION_CODES)[number];

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
