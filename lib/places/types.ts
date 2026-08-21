import type { ConfidenceResult, CoverageGrade, EvidenceClass, LocalizedString, Provenance } from "@/lib/domain";

export const PLACE_TYPES = ["province", "watershed", "forest-district", "municipality", "provincial-riding", "federal-riding", "reserve", "treaty-area"] as const;
export const PLACE_PROVINCES = ["BC", "AB", "ON", "QC"] as const;
export const GENERATED_RECORD_KINDS = ["place", "location", "search", "source", "citation", "download"] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];
export type PlaceProvince = (typeof PLACE_PROVINCES)[number];
export type GeneratedRecordKind = (typeof GENERATED_RECORD_KINDS)[number];
export type PublicNumberUnit = "ha" | "%" | "count" | "year" | "degrees-latitude" | "degrees-longitude" | "m";

export type PublicFigure = Readonly<{
  kind: "figure";
  value: number;
  unit: PublicNumberUnit;
  evidence: Exclude<EvidenceClass, "unknown">;
  confidence: ConfidenceResult;
  coverageGrade: CoverageGrade;
  provenance: Provenance;
}>;

export type PublicUnknown = Readonly<{
  kind: "unknown";
  evidence: "unknown";
  reason: LocalizedString;
  coverageGrade: CoverageGrade;
  provenance: Provenance;
}>;

export type PublicNumber = PublicFigure | PublicUnknown;
export type CoverageShare = Readonly<{ grade: CoverageGrade; share: PublicNumber }>;
export type PlaceEvent = Readonly<{ id: string; year: PublicNumber; evidence: EvidenceClass; title: LocalizedString; confidence: ConfidenceResult; limitation: LocalizedString; provenance: Provenance }>;
export type AnnualSummary = Readonly<{ year: PublicNumber; hectares: PublicNumber; eventIds: readonly string[] }>;

type ExampleBoundary = Readonly<{ status: "example"; reviewStatus: "unapproved"; productionEligible: false }>;
export type SourceRecord = ExampleBoundary & Readonly<{ id: string; title: LocalizedString; provenance: Provenance }>;
export type CitationRecord = ExampleBoundary & Readonly<{ id: string; sourceIds: readonly string[]; timeRange: Readonly<{ from: PublicNumber; to: PublicNumber }>; dataVersion: string; method: string }>;
export type DownloadRecord = ExampleBoundary & Readonly<{ id: string; label: LocalizedString; mediaType: "text/csv"; href: string; bytes: number; sha256: string }>;
export type SearchRecord = ExampleBoundary & Readonly<{ id: string; placeId: string; name: LocalizedString; aliases: LocalizedString }>;

export type Place = ExampleBoundary & Readonly<{
  id: string; type: PlaceType; province: PlaceProvince; name: LocalizedString; aliases: LocalizedString;
  boundaryEdition: string; boundaryVersion: string; forestHectares: PublicNumber; coverage: readonly CoverageShare[]; annual: readonly AnnualSummary[]; events: readonly PlaceEvent[];
  stats: readonly PublicNumber[]; sourceIds: readonly string[]; citationId: string; downloadId: string;
  safeguard?: LocalizedString;
}>;

export type Location = ExampleBoundary & Readonly<{
  coordinateId: string; summary: LocalizedString; latitude: PublicNumber; longitude: PublicNumber; accuracyMetres: PublicNumber;
  containingPlaceIds: readonly string[]; events: readonly PlaceEvent[];
}>;

export type RegistryEntry = Readonly<{ place: Place; location: Location; search: SearchRecord; source: SourceRecord; citation: CitationRecord; download: DownloadRecord }>;

export type GeneratedLocalizedRecord = Readonly<{
  kind: GeneratedRecordKind;
  entityId: string;
  locale: "en" | "fr";
  route: string | null;
  alternate: Readonly<{ locale: "en" | "fr"; href: string | null }>;
  strings: Readonly<Record<string, string>>;
  mdx: string;
}>;

export type GeneratedPageManifest = Readonly<{
  schemaVersion: "witness-tree/phase3-page-manifest/1";
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  placeTypes: number;
  provinces: number;
  entities: number;
  localizedRecords: number;
  localizedStaticPages: number;
  recordPairs: number;
  byteLengths: readonly Readonly<{ kind: GeneratedRecordKind; entityId: string; en: number; fr: number }>[];
}>;
