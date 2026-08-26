import type { CoverageGrade } from "../domain/coverage";
import type { LocalizedString } from "../domain/localized";
import type { Unknown } from "../domain/reported";

/** The only provinces in scope for the Version 2.1 Phase 4 enhancement gate. */
export type ProvincialEnhancementProvince = "BC" | "QC";

export type OptionalEnhancementGate = Readonly<{
  rightsVerified: boolean;
  evidenceAdmitted: boolean;
  coverageGeometryContainsPoint: boolean;
  coveragePeriodContainsYear: boolean;
  coverageGrade: CoverageGrade;
  boundaryEdition: string | null;
}>;

export type OptionalEnhancementAvailability =
  | Readonly<{
    kind: "available";
    province: ProvincialEnhancementProvince;
    boundaryEdition: string;
    coverageGrade: "enhanced-local-records";
  }>
  | Readonly<{
    kind: "unavailable";
    province: ProvincialEnhancementProvince;
    boundaryEdition: string | null;
    reported: Unknown;
  }>;

const UNAVAILABLE_REASONS: Readonly<Record<"rights" | "evidence" | "coverage", LocalizedString>> = {
  rights: {
    en: "This optional provincial source is unavailable because its reuse rights have not been verified.",
    fr: "Cette source provinciale facultative n’est pas disponible parce que ses droits de réutilisation n’ont pas été vérifiés.",
  },
  evidence: {
    en: "This optional provincial source is unavailable because its evidence has not been admitted.",
    fr: "Cette source provinciale facultative n’est pas disponible parce que ses données probantes n’ont pas été admises.",
  },
  coverage: {
    en: "This optional provincial detail is unavailable at this location or period because no admitted enhancement coverage geometry applies.",
    fr: "Ce détail provincial facultatif n’est pas disponible à cet endroit ou pour cette période parce qu’aucune géométrie de couverture enrichie admise ne s’applique.",
  },
};
const PHASE4_PROVINCES = new Set<ProvincialEnhancementProvince>(["BC", "QC"]);

function requireBoundaryEdition(value: string | null): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error("An enhancement boundary edition is required for available detail.");
}

/**
 * Applies the Phase 4 admission boundary before local events reach matching or
 * precedence. An absent, unlicensed, unadmitted, or out-of-coverage source is
 * always a bilingual Unknown; it is never a zero or an enhanced coverage claim.
 */
export function resolveOptionalEnhancementAvailability(
  province: ProvincialEnhancementProvince,
  gate: OptionalEnhancementGate,
): OptionalEnhancementAvailability {
  if (!PHASE4_PROVINCES.has(province)) throw new Error("Phase 4 enhancements are limited to BC and QC.");
  if (typeof gate.rightsVerified !== "boolean" || typeof gate.evidenceAdmitted !== "boolean" || typeof gate.coverageGeometryContainsPoint !== "boolean" || typeof gate.coveragePeriodContainsYear !== "boolean") {
    throw new Error("Optional enhancement gates require explicit boolean evidence.");
  }

  const unavailable = (reason: keyof typeof UNAVAILABLE_REASONS): OptionalEnhancementAvailability => ({
    kind: "unavailable",
    province,
    boundaryEdition: gate.boundaryEdition,
    reported: {
      kind: "unknown",
      evidence: "unknown",
      reason: UNAVAILABLE_REASONS[reason],
      coverageGrade: gate.coverageGrade,
    },
  });

  if (!gate.rightsVerified) return unavailable("rights");
  if (!gate.evidenceAdmitted) return unavailable("evidence");
  if (!gate.coverageGeometryContainsPoint || !gate.coveragePeriodContainsYear || gate.coverageGrade !== "enhanced-local-records") return unavailable("coverage");
  requireBoundaryEdition(gate.boundaryEdition);

  return {
    kind: "available",
    province,
    boundaryEdition: gate.boundaryEdition,
    coverageGrade: "enhanced-local-records",
  };
}
