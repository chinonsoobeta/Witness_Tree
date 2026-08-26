import type { ConfidenceResult } from "../domain/confidence";
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

/**
 * The coordinate reference system every normalized ingestion geometry must declare.
 * `lib/records/types.ts` accepts `EPSG:4326` or `EPSG:3347` downstream, and `lib/records/validate.ts`
 * range-checks longitude and latitude only when the CRS is `EPSG:4326`, so `EPSG:4326` is the one
 * declared value whose coordinates this project can actually bound-check. Staged provincial archives
 * arrive in other systems (`EPSG:32198` for Quebec, `EPSG:3400` for Alberta, and the NTEMS Lambert
 * grid that carries no EPSG code at all), so reprojection has to happen before the ingestion
 * boundary. Requiring the declaration here makes an unreprojected extract a hard stop instead of a
 * silent set of metre coordinates read as degrees.
 */
export const INGESTION_CRS = "EPSG:4326";

/** First year of the plan's national baseline. Event dates before it are outside the declared window. */
export const BASELINE_FIRST_YEAR = 1984;

/** Declared field sets. Anything outside them is schema drift and is refused rather than dropped. */
export const SOURCE_CONTRACT_FIELDS = [
  "status",
  "id",
  "datasetName",
  "publisher",
  "catalogueUrl",
  "licenceId",
  "explanation",
  "fieldMapping",
  "boundaryVersion",
  "sourceVersion",
  "retrievedAt",
  "rawChecksumSha256",
] as const;

export const FIELD_MAPPING_FIELDS = ["id", "geometry", "date", "areaHectares", "category"] as const;

export const POLYGON_GEOMETRY_FIELDS = ["type", "crs", "coordinates"] as const;

export const EVENT_PROVENANCE_FIELDS = ["sourceId", "sourceVersion", "retrievedAt", "rawChecksumSha256"] as const;

export const NORMALIZED_EVENT_FIELDS = [
  "status",
  "id",
  "category",
  "evidence",
  "organisation",
  "organisationRole",
  "eventDate",
  "eventYear",
  "sourceVersion",
  "geometry",
  "hectares",
  "provenance",
  "confidence",
  "coverageGrade",
] as const;

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
  crs: typeof INGESTION_CRS;
  coordinates: readonly (readonly (readonly [number, number])[])[];
}>;

/** An event id observed in more than one source. Reported, not refused. See `findCrossSourceDuplicates`. */
export type CrossSourceDuplicate = Readonly<{
  eventId: string;
  sourceIds: readonly string[];
}>;

/** One source contract and the events normalized from it. */
export type SourceBatch = Readonly<{
  source: SourceContract;
  events: readonly NormalizedEvent[];
}>;

export type EventProvenance = Readonly<{
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  rawChecksumSha256: string;
}>;

export type NormalizedEvent = Readonly<{
  status: "example";
  id: string;
  category: NormalizedEventCategory;
  evidence: Exclude<EvidenceClass, "unknown">;
  organisation: string;
  organisationRole: string;
  eventDate: string;
  eventYear: number;
  sourceVersion: string;
  geometry: PolygonGeometry;
  hectares: number;
  provenance: EventProvenance;
  confidence: ConfidenceResult;
  coverageGrade: CoverageGrade;
}>;
