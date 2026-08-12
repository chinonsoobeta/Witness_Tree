import type { Figure, Reported, Unknown } from "@/lib/domain";
import { ReportedValue } from "@/components/policy";

const provenance = {
  dataset: "National baseline",
  version: "2026.1",
  retrievedDate: "2026-08-11",
  licence: "ogl-canada-2.0",
} as const;

const figure: Figure = {
  kind: "figure",
  value: 12.5,
  unit: "ha",
  evidence: "official-record",
  confidence: {
    level: "high",
    ruleId: "CONF-HIGH-001",
    reason: { en: "Direct authoritative record with clear geometry, date and attributes.", fr: "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs." },
  },
  provenance,
};

const unknown: Unknown = {
  kind: "unknown",
  evidence: "unknown",
  reason: "No authoritative public record has been integrated for this question.",
  coverageGrade: "national-baseline",
};

const reported: Reported = figure;

void <ReportedValue reported={reported} coverageGrade="national-baseline" locale="en" />;
void <ReportedValue reported={unknown} coverageGrade="national-baseline" locale="en" />;

// @ts-expect-error A figure must carry evidence.
const missingEvidence: Figure = { ...figure, evidence: undefined };
// @ts-expect-error A figure must carry confidence, including its generated reason.
const missingConfidenceReason: Figure = { ...figure, confidence: { ...figure.confidence, reason: undefined } };
// @ts-expect-error A figure must carry provenance.
const missingProvenance: Figure = { ...figure, provenance: undefined };
// @ts-expect-error Coverage is required by the display component.
void <ReportedValue reported={reported} locale="en" />;
// @ts-expect-error Unknown has no numeric value, so it cannot be constructed as a figure.
const unknownAsFigure: Figure = { ...unknown };

void missingEvidence;
void missingConfidenceReason;
void missingProvenance;
void unknownAsFigure;
