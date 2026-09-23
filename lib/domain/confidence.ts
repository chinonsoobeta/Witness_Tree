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
    `Good evidence, with one important gap: ${limitationEn}.`,
    `Bonne preuve, avec une lacune importante : ${limitationFr}.`,
  );

export function assignConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.coverageGap || (input.inventoryAgeAtEventYears ?? 0) > 5 || (input.geometryResolutionMetres ?? 0) > 100) {
    const years = input.inventoryAgeAtEventYears;
    const reason = years && years > 5
      ? localized(
          `The forest inventory is ${years} years older than the event, and its details were not updated for tree growth.`,
          `L’inventaire forestier a ${years} ans de plus que l’événement, et ses détails n’ont pas été mis à jour selon la croissance des arbres.`,
        )
      : localized(
          "A rough guide only: the data here has a known gap or is not detailed enough.",
          "Simple indication : les données ont ici une lacune connue ou manquent de précision.",
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
        "An official record with a clear location, date and details.",
        "Un registre officiel avec un emplacement, une date et des détails clairs.",
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
      reason: mediumReason("a required detail is missing", "un détail requis manque"),
    };
  }

  return {
    level: "unknown",
    ruleId: "CONF-UNKNOWN-001",
    reason: localized(
      "No official public record answers this question yet.",
      "Aucun registre public officiel ne répond encore à cette question.",
    ),
  };
}
