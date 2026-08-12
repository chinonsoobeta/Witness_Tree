import type { LicenceId } from "../domain/source-ledger";
import type { NormalizedEvent, PolygonGeometry, SourceContract } from "./schema";

const SHA_256 = /^[a-f0-9]{64}$/i;
const UNKNOWN_ZERO = /\bunknown\b\s*[:=]?\s*0(?:\.0+)?\b/i;
const MAX_HECTARES = 100_000_000;
const NORMALIZED_EVENT_CATEGORIES = ["recorded-harvest", "fire", "insect-disease", "other-intervention", "detected-change"] as const;
const LICENCE_IDS = ["ogl-canada-2.0", "ogl-bc-2.0", "ogl-alberta", "ogl-ontario", "cc-by-4.0-quebec", "terms-pending"] as const;

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Ingestion contract requires ${field}.`);
  return value;
}

function isoDate(value: unknown, field: string): string {
  const date = required(value, field);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Ingestion contract ${field} is invalid.`);
  return date;
}

function isoTimestamp(value: unknown, field: string): string {
  const timestamp = required(value, field);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Ingestion contract ${field} is invalid.`);
  return timestamp;
}

function exampleUrl(value: unknown, field: string): string {
  const url = required(value, field);
  if (!/^https:\/\/[^/]*example\.local(?:\/|$)/.test(url)) throw new Error(`Example fixtures must use example.local for ${field}.`);
  return url;
}

function validateGeometry(geometry: PolygonGeometry): PolygonGeometry {
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) throw new Error("Ingestion event geometry is corrupt.");
  for (const ring of geometry.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) throw new Error("Ingestion event geometry is corrupt.");
    for (const position of ring) {
      if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) throw new Error("Ingestion event geometry is corrupt.");
    }
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) throw new Error("Ingestion event geometry is corrupt.");
  }
  return geometry;
}

export function validateSourceContract(candidate: Partial<SourceContract>): SourceContract {
  if (candidate.status !== "example") throw new Error("Ingestion fixtures must be labelled example.");
  const licenceId = candidate.licenceId;
  if (!licenceId || !LICENCE_IDS.includes(licenceId as LicenceId)) throw new Error("Ingestion source requires a registered licence ID.");
  const explanation = candidate.explanation;
  if (!explanation?.en?.trim() || !explanation.fr.trim()) throw new Error("Ingestion source requires English and French explanations.");
  const fieldMapping = candidate.fieldMapping;
  const mappings = ["id", "geometry", "date", "areaHectares", "category"] as const;
  if (!fieldMapping || mappings.some((field) => !fieldMapping[field]?.trim())) throw new Error("Ingestion source requires a complete field mapping.");
  const rawChecksumSha256 = required(candidate.rawChecksumSha256, "rawChecksumSha256");
  if (!SHA_256.test(rawChecksumSha256)) throw new Error("Ingestion source requires a SHA-256 checksum.");
  const result = {
    status: candidate.status,
    id: required(candidate.id, "id"),
    datasetName: required(candidate.datasetName, "datasetName"),
    publisher: required(candidate.publisher, "publisher"),
    catalogueUrl: exampleUrl(candidate.catalogueUrl, "catalogueUrl"),
    licenceId,
    explanation: { en: explanation.en, fr: explanation.fr },
    fieldMapping: { ...fieldMapping },
    boundaryVersion: required(candidate.boundaryVersion, "boundaryVersion"),
    sourceVersion: required(candidate.sourceVersion, "sourceVersion"),
    retrievedAt: isoTimestamp(candidate.retrievedAt, "retrievedAt"),
    rawChecksumSha256: rawChecksumSha256.toLowerCase(),
  } as const;
  if (UNKNOWN_ZERO.test(JSON.stringify(result))) throw new Error("Ingestion source cannot publish an Unknown numeric zero.");
  return Object.freeze(result);
}

export function validateNormalizedEvent(candidate: Partial<NormalizedEvent>, source: SourceContract): NormalizedEvent {
  if (candidate.status !== "example") throw new Error("Ingestion fixtures must be labelled example.");
  if (!NORMALIZED_EVENT_CATEGORIES.includes(candidate.category as NormalizedEvent["category"])) throw new Error("Ingestion event category is invalid.");
  if (candidate.evidence !== "official-record" && candidate.evidence !== "satellite-observation" && candidate.evidence !== "derived-estimate") throw new Error("Ingestion event evidence is invalid.");
  const eventDate = isoDate(candidate.eventDate, "eventDate");
  const eventYear = candidate.eventYear;
  if (!Number.isInteger(eventYear) || eventYear !== Number(eventDate.slice(0, 4))) throw new Error("Ingestion event year must match its date.");
  const hectares = candidate.hectares;
  if (typeof hectares !== "number" || !Number.isFinite(hectares) || hectares <= 0 || hectares > MAX_HECTARES) throw new Error("Ingestion event hectares are out of range.");
  const provenance = candidate.provenance;
  if (!provenance || provenance.sourceId !== source.id || provenance.sourceVersion !== source.sourceVersion || provenance.retrievedAt !== source.retrievedAt || provenance.rawChecksumSha256 !== source.rawChecksumSha256) {
    throw new Error("Ingestion event provenance must match its source contract.");
  }
  if (candidate.sourceVersion !== source.sourceVersion) throw new Error("Ingestion event sourceVersion must match its source contract.");
  if (!candidate.confidence || !candidate.coverageGrade) throw new Error("Ingestion event requires confidence and coverage.");
  const result = {
    status: candidate.status,
    id: required(candidate.id, "id"),
    category: candidate.category,
    evidence: candidate.evidence,
    organisation: required(candidate.organisation, "organisation"),
    organisationRole: required(candidate.organisationRole, "organisationRole"),
    eventDate,
    eventYear,
    sourceVersion: source.sourceVersion,
    geometry: validateGeometry(candidate.geometry as PolygonGeometry),
    hectares,
    provenance: { ...provenance },
    confidence: candidate.confidence,
    coverageGrade: candidate.coverageGrade,
  } as NormalizedEvent;
  if (UNKNOWN_ZERO.test(JSON.stringify(result))) throw new Error("Ingestion event cannot publish an Unknown numeric zero.");
  return Object.freeze(result);
}

/** Keeps official evidence even when it has no corresponding detected-change record. */
export function retainOfficialRecordsWithoutDetectedChange(events: readonly NormalizedEvent[], detectedChangeIds: ReadonlySet<string>): readonly NormalizedEvent[] {
  return events.filter((event) => event.evidence === "official-record" && !detectedChangeIds.has(event.id));
}
