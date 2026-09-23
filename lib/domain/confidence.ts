import { localized, type LocalizedString } from "./localized";

export type ConfidenceLevel = "high" | "medium" | "limited" | "unknown";

export type ConfidenceInput = Readonly<{
  authoritativeRecord: boolean;
  geometryResolved: boolean;
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

const mediumReason = (limitationEn: string, limitationFr: string): LocalizedString =>
  localized(
    `Strong evidence with a material limitation: ${limitationEn}.`,
    `Preuve solide comportant une limite importante : ${limitationFr}.`,
  );

export function assignConfidence(input: ConfidenceInput): ConfidenceResult {
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
    && input.geometryResolved
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

  if (input.authoritativeRecord || input.geometryResolved) {
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
