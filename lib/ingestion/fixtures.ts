import type { NormalizedEvent, SourceContract } from "./schema";
import { INGESTION_CRS } from "./schema";

const checksum = "a".repeat(64);
const geometry: NormalizedEvent["geometry"] = { type: "Polygon", crs: INGESTION_CRS, coordinates: [[[-75, 46], [-75, 46.1], [-74.9, 46.1], [-75, 46]]] };
const confidence: NormalizedEvent["confidence"] = { level: "high", ruleId: "CONF-HIGH-001", reason: { en: "Illustrative authoritative record.", fr: "Registre illustratif faisant autorité." } };

export const EXAMPLE_SOURCE_CONTRACT: SourceContract = Object.freeze({
  status: "example",
  id: "example-fire-records",
  datasetName: "Example fire records",
  publisher: "Example Provincial Agency",
  catalogueUrl: "https://catalogue.example.local/fire-records",
  licenceId: "ogl-canada-2.0",
  explanation: { en: "Illustrative source only.", fr: "Source illustrative seulement." },
  fieldMapping: { id: "record_id", geometry: "geometry", date: "record_date", areaHectares: "area_ha", category: "event_type" },
  boundaryVersion: "example-boundary-2023",
  sourceVersion: "example-v1",
  retrievedAt: "2026-08-11T00:00:00Z",
  rawChecksumSha256: checksum,
});

export const EXAMPLE_OFFICIAL_EVENT: NormalizedEvent = Object.freeze({
  status: "example",
  id: "example-record-without-change",
  category: "fire",
  evidence: "official-record",
  organisation: "Example Provincial Agency",
  organisationRole: "record publisher",
  eventDate: "2025-08-11",
  eventYear: 2025,
  sourceVersion: EXAMPLE_SOURCE_CONTRACT.sourceVersion,
  geometry,
  hectares: 12.5,
  provenance: { sourceId: EXAMPLE_SOURCE_CONTRACT.id, sourceVersion: EXAMPLE_SOURCE_CONTRACT.sourceVersion, retrievedAt: EXAMPLE_SOURCE_CONTRACT.retrievedAt, rawChecksumSha256: checksum },
  confidence,
  coverageGrade: "national-baseline",
});
