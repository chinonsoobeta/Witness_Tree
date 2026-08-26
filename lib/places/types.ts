import type { ConfidenceResult, CoverageGrade, EvidenceClass, LocalizedString, Provenance, Reported } from "@/lib/domain";

export const PLACE_TYPES = ["province", "watershed", "forest-district", "municipality", "provincial-riding", "federal-riding", "reserve", "treaty-area"] as const;
export const PLACE_PROVINCES = ["BC", "AB", "ON", "QC"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];
export type PlaceProvince = (typeof PLACE_PROVINCES)[number];
export type ExampleStatus = "example";

export type CoverageShare = Readonly<{ grade: CoverageGrade; share: number }>;
export type PlaceEvent = Readonly<{ id: string; year: number; evidence: EvidenceClass; title: LocalizedString; confidence: ConfidenceResult; limitation: LocalizedString; provenance: Provenance }>;
export type AnnualSummary = Readonly<{ year: number; hectares: number; eventIds: readonly string[] }>;
export type Place = Readonly<{
  status: ExampleStatus; id: string; type: PlaceType; province: PlaceProvince; name: LocalizedString; aliases: LocalizedString;
  boundaryEdition: string; boundaryVersion: string; forestHectares: number; coverage: readonly CoverageShare[]; annual: readonly AnnualSummary[]; events: readonly PlaceEvent[];
  stats: readonly Reported[]; sources: readonly string[]; citation: Readonly<{ timeRange: string; dataVersion: string; method: string }>;
  safeguard?: LocalizedString;
}>;
export type Location = Readonly<{ status: ExampleStatus; id: string; summary: LocalizedString; latitude: number; longitude: number; accuracyMetres: number; containingPlaceIds: readonly string[]; events: readonly PlaceEvent[] }>;
