import type { ConfidenceResult, CoverageGrade, EvidenceClass, LicenceId, LocalizedString } from "@/lib/domain";
import type { PlaceType } from "@/lib/places";
import type { FOREST_DEFINITION_VERSION } from "@/lib/domain/forest";

export type ExampleStatus = "example";
export type Geometry = Readonly<{ crs: "EPSG:4326" | "EPSG:3347"; original: GeoJSON; normalized: GeoJSON; areaHectares: number; positionalConfidenceMetres: number }>;
export type GeoJSON = Readonly<{ type: "Point" | "Polygon" | "MultiPolygon"; coordinates: unknown }>;
export type BoundaryEdition = Readonly<{ status: ExampleStatus; id: string; placeType: PlaceType; effectiveFrom: string; effectiveTo?: string; retired: boolean; geometry: Geometry }>;
export type ForestEvent = Readonly<{ status: ExampleStatus; id: string; sourceRecordId: string; ingestId: string; evidence: EvidenceClass; confidence: ConfidenceResult; geometry: Geometry; observedFrom: string; observedTo: string; eventDate?: string; dateConfidence: "day" | "month" | "year" | "unknown"; lifecycle: "ACTIVE" | "RETIRED" | "PENDING" | "UNKNOWN"; subtype: string; tenure: string; forestContext: Readonly<{ definitionVersion: typeof FOREST_DEFINITION_VERSION; forestedHectares: number; referenceYear: number }>; organisation?: Readonly<{ name: string; role: string; date: string; confidence: ConfidenceResult }>; recovery?: Readonly<{ observedDate: string; canopyStatus: "recovery-indicated" | "not-observed" }>; display: LocalizedString; limitations: LocalizedString; methodVersion: string; corroborated?: boolean }>;
export type SourceRecord = Readonly<{ status: ExampleStatus; id: string; ingestId: string; dataset: string; version: string; licence: LicenceId; retrievedAt: string; checksumSha256: string; sourceUrl: string }>;
export type AggregateResult = Readonly<{ status: ExampleStatus; id: string; boundaryEditionId: string; denominator: Readonly<{ hectares: number; referenceYear: number; definitionVersion: typeof FOREST_DEFINITION_VERSION }>; timeRange: Readonly<{ from: string; to: string }>; dataVersion: string; coverageGrade: CoverageGrade; eventIds: readonly string[] }>;
