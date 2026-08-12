import type { ExploreEvent } from "./types";
const confidence = { level: "medium", ruleId: "CONF-MEDIUM-001", reason: { en: "Strong evidence with a material limitation: one required attribute is unavailable.", fr: "Preuve solide comportant une limite importante : un attribut requis est indisponible." } } as const;
const provenance = { dataset: "Illustrative fixture only", version: "example-1", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0" } as const;
export const exploreFixtures: readonly ExploreEvent[] = [
  { id: "change", mode: "detected-change", year: 2004, name: { en: "Detected tree-cover change", fr: "Changement de couvert arboré détecté" }, evidence: "satellite-observation", confidence, coverageGrade: "national-baseline", provenance },
  { id: "harvest", mode: "official-harvest", year: 2012, name: { en: "Recorded harvest", fr: "Récolte consignée" }, evidence: "official-record", confidence, coverageGrade: "enhanced-local-records", provenance },
  { id: "fire", mode: "wildfire-perimeter", year: 2020, name: { en: "Reported fire perimeter", fr: "Périmètre d’incendie déclaré" }, evidence: "official-record", confidence, coverageGrade: "national-baseline", provenance },
  { id: "insect", mode: "insect-mortality", year: 1988, name: { en: "Unknown record status", fr: "État du registre inconnu" }, evidence: "unknown", confidence: { level: "unknown", ruleId: "CONF-UNKNOWN-001", reason: { en: "No authoritative public record has been integrated for this question.", fr: "Aucun registre public faisant autorité n’a été intégré pour cette question." } }, coverageGrade: "extended-record-sparse-official-matching", provenance, unknownReason: "No authoritative public record has been integrated for this question." },
];
