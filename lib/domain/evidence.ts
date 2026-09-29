import { localized, type LocalizedString } from "./localized";

export const EVIDENCE_CLASSES = [
  "official-record",
  "satellite-observation",
  "derived-estimate",
  "unknown",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export type EvidenceDefinition = Readonly<{
  label: LocalizedString;
  maySay: LocalizedString;
  mayNotSay: LocalizedString;
}>;

export const EVIDENCE_DEFINITIONS: Record<EvidenceClass, EvidenceDefinition> = {
  "official-record": {
    label: localized("Official record", "Registre officiel"),
    maySay: localized(
      "Recorded harvest or intervention; within a reported fire perimeter; recorded tenure holder or client.",
      "Récolte ou intervention consignée\u202F; à l’intérieur d’un périmètre d’incendie déclaré\u202F; titulaire ou client consigné.",
    ),
    mayNotSay: localized(
      "The logger; deforested; any compliance conclusion.",
      "L’exploitant forestier\u202F; déboisé\u202F; toute conclusion de conformité.",
    ),
  },
  "satellite-observation": {
    label: localized("Satellite observation", "Observation satellitaire"),
    maySay: localized(
      "Tree cover reduction detected; later imagery indicates canopy recovery.",
      "Réduction du couvert arboré détectée\u202F; des images ultérieures indiquent une reprise du couvert.",
    ),
    mayNotSay: localized(
      "Logged; fully regenerated; permanent loss.",
      "Exploité\u202F; entièrement régénéré\u202F; perte permanente.",
    ),
  },
  "derived-estimate": {
    label: localized("Derived estimate", "Estimation dérivée"),
    maySay: localized(
      "The perimeter intersects an estimated area of mapped mature forest.",
      "Le périmètre recoupe une superficie estimée de forêt mature cartographiée.",
    ),
    mayNotSay: localized(
      "The fire destroyed that area unless a qualified damage source supports it.",
      "L’incendie a détruit cette superficie, sauf si une source qualifiée sur les dommages l’établit.",
    ),
  },
  unknown: {
    label: localized("Unknown", "Inconnu"),
    maySay: localized(
      "No authoritative public record has been integrated for this question.",
      "Aucun registre public faisant autorité n’a été intégré pour cette question.",
    ),
    mayNotSay: localized(
      "Any inferred organisation, cause or date presented as fact.",
      "Toute organisation, cause ou date déduite et présentée comme un fait.",
    ),
  },
};

export function isEvidenceClass(value: unknown): value is EvidenceClass {
  return typeof value === "string" && EVIDENCE_CLASSES.includes(value as EvidenceClass);
}
