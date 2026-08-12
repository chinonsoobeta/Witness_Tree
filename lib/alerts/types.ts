import type { AlertCadence, SavedArea } from "../accounts/types.ts";
import type { Locale, LocalizedString, Reported } from "../domain/index.ts";
import type { EvidenceClass } from "../domain/evidence.ts";

export const ALERT_TRIGGER_CLASSES = ["wildfire-intersection", "wildfire-nearby", "official-record", "unmatched-detected-change", "annual-data-release", "correction", "coverage-grade-change"] as const;
export type AlertTriggerClass = typeof ALERT_TRIGGER_CLASSES[number];
export const DEFAULT_CADENCE: Readonly<Record<AlertTriggerClass, AlertCadence>> = { "wildfire-intersection": "immediate", "wildfire-nearby": "immediate", "official-record": "weekly-digest", "unmatched-detected-change": "weekly-digest", "annual-data-release": "immediate", correction: "immediate", "coverage-grade-change": "monthly-digest" };
/** Mirrors the canonical labels in lib/domain/evidence without pulling a Node-incompatible runtime dependency into this pure runner. */
export const CANONICAL_EVIDENCE_FIRST_LINES: Readonly<Record<EvidenceClass, LocalizedString>> = {
  "official-record": { en: "Official record", fr: "Registre officiel" },
  "satellite-observation": { en: "Satellite observation", fr: "Observation satellitaire" },
  "derived-estimate": { en: "Derived estimate", fr: "Estimation dérivée" },
  unknown: { en: "Unknown", fr: "Inconnu" },
};
export const isAlertEvidence = (value: unknown): value is EvidenceClass => typeof value === "string" && value in CANONICAL_EVIDENCE_FIRST_LINES;

export type AlertEvent = Readonly<{ id: string; trigger: AlertTriggerClass; areaIds: readonly string[]; observedAt: string; dataVersion: string; sourceAgency: string; evidence: EvidenceClass; reported: Reported; versionedUrl: string; authorityUrl?: string; releaseId?: string; fingerprint: string; correctionOf?: string }>;
export type AlertHistoryEntry = Readonly<{ areaId: string; eventId: string; fingerprint: string; sentAt: string; dataVersion: string; cadence: AlertCadence; releaseId?: string }>;
export type AlertPayload = Readonly<{ areaId: string; ownerId: string; trigger: AlertTriggerClass; cadence: AlertCadence; overflowToDigest: boolean; locale: Locale; evidence: EvidenceClass; evidenceFirstLine: LocalizedString; dataVersion: string; sourceAgency: string; observedAt: string; versionedUrl: string; authorityUrl?: string; authorityBeforeProduct?: true; template: string }>;
export type AlertEvaluation = Readonly<{ alerts: readonly AlertPayload[]; skipped: readonly (Readonly<{ eventId: string; areaId: string; reason: "duplicate" | "already-released" | "not-previously-notified" }>)[] }>;
export type AlertReadyArea = SavedArea & Readonly<{ name: string; note: string; alertCadence: AlertCadence; alertLocale: Locale }>;
