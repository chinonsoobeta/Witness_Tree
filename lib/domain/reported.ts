import type { ConfidenceResult } from "./confidence";
import type { CoverageGrade } from "./coverage";
import type { EvidenceClass } from "./evidence";
import type { LicenceId } from "./source-ledger";
import type { LocalizedString, Locale } from "./localized";

export type Provenance = Readonly<{
  dataset: string;
  version: string;
  retrievedDate: string;
  licence: LicenceId;
  recordUrl?: string;
}>;

export type Figure = Readonly<{
  kind: "figure";
  value: number;
  unit: "ha" | "%" | "count" | "year";
  evidence: Exclude<EvidenceClass, "unknown">;
  confidence: ConfidenceResult;
  provenance: Provenance;
}>;

export type Unknown = Readonly<{
  kind: "unknown";
  evidence: "unknown";
  reason: LocalizedString;
  coverageGrade: CoverageGrade;
}>;

export type Reported = Figure | Unknown;

export function formatReported(value: Reported, locale: Locale = "en"): string {
  if (value.kind === "unknown") return `– ${value.reason[locale]}`;
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 }).format(value.value);
}
