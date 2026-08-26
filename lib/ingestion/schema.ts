import type { ConfidenceInput, ConfidenceResult } from "../domain/confidence";
import type { CoverageGrade } from "../domain/coverage";
import type { EvidenceClass } from "../domain/evidence";
import type { LocalizedString } from "../domain/localized";
import type { LicenceId } from "../domain/source-ledger";

export const NORMALIZED_EVENT_CATEGORIES = [
  "recorded-harvest",
  "fire",
  "insect-disease",
  "other-intervention",
  "detected-change",
] as const;

export type NormalizedEventCategory = (typeof NORMALIZED_EVENT_CATEGORIES)[number];

export type SourceContract = Readonly<{
  status: "example";
  id: string;
  datasetName: string;
  publisher: string;
  catalogueUrl: string;
  licenceId: LicenceId;
  explanation: LocalizedString;
  fieldMapping: Readonly<Record<"id" | "geometry" | "date" | "areaHectares" | "category", string>>;
  boundaryVersion: string;
  sourceVersion: string;
  retrievedAt: string;
  rawChecksumSha256: string;
}>;

export type PolygonGeometry = Readonly<{
  type: "Polygon";
  coordinates: readonly (readonly (readonly [number, number])[])[];
}>;

export type EventProvenance = Readonly<{
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  rawChecksumSha256: string;
}>;

export type OrganisationAttribution = Readonly<{
  name: string;
  role: string;
  recordUrl: string;
  recordDate: string;
  recordVersion: string;
}>;

export type EventInput = Readonly<{
  id: string;
  category: NormalizedEventCategory;
  evidence: Exclude<EvidenceClass, "unknown">;
  organisation?: OrganisationAttribution;
  eventDate: string;
  eventYear: number;
  geometry: PolygonGeometry;
  hectares: number;
  confidence: ConfidenceResult;
  coverageGrade: CoverageGrade;
}>;

export type NormalizedEvent = EventInput & Readonly<{
  status: "example";
  sourceVersion: string;
  provenance: EventProvenance;
}>;

export type AdmittedEventInput = Omit<EventInput, "confidence"> & Readonly<{
  confidenceInput: ConfidenceInput;
}>;

export type AdmittedNormalizedEvent = EventInput & Readonly<{
  status: "admitted";
  sourceVersion: string;
  provenance: EventProvenance;
}>;
