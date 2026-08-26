import { localized, type LocalizedString } from "./localized";
import type { EvidenceClass } from "./evidence";

export type ConfidenceLevel = "high" | "medium" | "limited" | "unknown";

export type ConfidenceInput = Readonly<{
  evidenceClass: EvidenceClass;
  authoritativeRecord: boolean;
  geometryResolved: boolean;
  eventDateResolvedToYear: boolean;
  dateUncertaintyYears?: number;
  requiredAttributesPresent: boolean;
  partialAttribution?: boolean;
  geometryResolutionMetres?: number;
  inventoryAgeAtEventYears?: number;
  coverageGap?: boolean;
}>;

export type ConfidenceResult = Readonly<{
  level: ConfidenceLevel;
  ruleId: "CONF-HIGH-001" | "CONF-MEDIUM-001" | "CONF-LIMITED-001" | "CONF-UNKNOWN-001";
  reason: LocalizedString;
}>;

const RULE_BY_LEVEL: Readonly<Record<ConfidenceLevel, ConfidenceResult["ruleId"]>> = {
  high: "CONF-HIGH-001",
  medium: "CONF-MEDIUM-001",
  limited: "CONF-LIMITED-001",
  unknown: "CONF-UNKNOWN-001",
};

export function validateConfidenceResult(result: ConfidenceResult, evidenceClass: EvidenceClass): ConfidenceResult {
  if (!result || RULE_BY_LEVEL[result.level] !== result.ruleId || !result.reason?.en.trim() || !result.reason.fr.trim()) {
    throw new Error("Confidence requires a matching level, rule identifier, and bilingual explanation.");
  }
  if (result.level === "high" && evidenceClass !== "official-record") throw new Error("High confidence requires official-record evidence.");
  return result;
}

const mediumReason = (limitationEn: string, limitationFr: string): LocalizedString =>
  localized(
    `Strong evidence with a material limitation: ${limitationEn}.`,
    `Preuve solide comportant une limite importante : ${limitationFr}.`,
  );

const OPTIONAL_NUMBERS: readonly (keyof Pick<ConfidenceInput,
  "dateUncertaintyYears" | "geometryResolutionMetres" | "inventoryAgeAtEventYears"
>)[] = ["dateUncertaintyYears", "geometryResolutionMetres", "inventoryAgeAtEventYears"];

function validateConfidenceInput(input: ConfidenceInput): void {
  for (const field of OPTIONAL_NUMBERS) {
    const value = input[field];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${field} must be a finite, non-negative number.`);
    }
  }
}

export function assignConfidence(input: ConfidenceInput): ConfidenceResult {
  validateConfidenceInput(input);
  if (input.coverageGap || (input.inventoryAgeAtEventYears ?? 0) > 5 || (input.geometryResolutionMetres ?? 0) > 100) {
    const years = input.inventoryAgeAtEventYears;
    const reason = years && years > 5
      ? localized(
          `Inventory vintage predates the event by ${years} years. Attributes were carried forward without growth modelling.`,
          `Le millésime de l’inventaire précède l’événement de ${years} ans. Les attributs ont été reportés sans modélisation de la croissance.`,
        )
      : localized(
          "Useful indication only because a documented coverage or resolution limit affects this location.",
          "Indication utile seulement, car une limite documentée de couverture ou de résolution touche cet emplacement.",
        );
    return { level: "limited", ruleId: "CONF-LIMITED-001", reason };
  }

  if (
    input.authoritativeRecord
    && input.evidenceClass === "official-record"
    && input.geometryResolved
    && input.eventDateResolvedToYear
    && (input.dateUncertaintyYears ?? 0) <= 1
    && input.requiredAttributesPresent
    && !input.partialAttribution
  ) {
    return {
      level: "high",
      ruleId: "CONF-HIGH-001",
      reason: localized(
        "Direct authoritative record with clear geometry, date and attributes.",
        "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs.",
      ),
    };
  }

  if (input.evidenceClass !== "unknown" && (input.authoritativeRecord || input.geometryResolved)) {
    if (!input.eventDateResolvedToYear) {
      return {
        level: "medium",
        ruleId: "CONF-MEDIUM-001",
        reason: mediumReason(
          "the event date is not resolved to the year",
          "la date de l’événement n’est pas déterminée à l’année près",
        ),
      };
    }
    const dateUncertainty = input.dateUncertaintyYears ?? 0;
    if (dateUncertainty > 1) {
      return {
        level: "medium",
        ruleId: "CONF-MEDIUM-001",
        reason: mediumReason(
          `the event date is uncertain by ${dateUncertainty} years`,
          `la date de l’événement est incertaine à ${dateUncertainty} ans près`,
        ),
      };
    }
    if (input.partialAttribution) {
      return {
        level: "medium",
        ruleId: "CONF-MEDIUM-001",
        reason: mediumReason("the attribution is partial", "l’attribution est partielle"),
      };
    }
    if (input.evidenceClass === "derived-estimate") {
      return {
        level: "medium",
        ruleId: "CONF-MEDIUM-001",
        reason: mediumReason("the value is a documented derivation from source inputs", "la valeur est une dérivation documentée à partir de données sources"),
      };
    }
    return {
      level: "medium",
      ruleId: "CONF-MEDIUM-001",
      reason: mediumReason("one required attribute is unavailable", "un attribut requis n’est pas disponible"),
    };
  }

  return {
    level: "unknown",
    ruleId: "CONF-UNKNOWN-001",
    reason: localized(
      "No authoritative public record has been integrated for this question.",
      "Aucun registre public faisant autorité n’a été intégré pour cette question.",
    ),
  };
}
