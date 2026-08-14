import type { LicenceId } from "../domain/source-ledger";
import type { CrossSourceDuplicate, NormalizedEvent, PolygonGeometry, SourceBatch, SourceContract } from "./schema";
import { BASELINE_FIRST_YEAR, EVENT_PROVENANCE_FIELDS, FIELD_MAPPING_FIELDS, INGESTION_CRS, NORMALIZED_EVENT_FIELDS, POLYGON_GEOMETRY_FIELDS, SOURCE_CONTRACT_FIELDS } from "./schema";

const SHA_256 = /^[a-f0-9]{64}$/i;
const UNKNOWN_ZERO = /\bunknown\b\s*[:=]?\s*0(?:\.0+)?\b/i;
const MAX_HECTARES = 100_000_000;
/** Metres per degree of longitude at the equator and per degree of latitude, for the bounding-box unit check. */
const METRES_PER_DEGREE_LONGITUDE = 111_320;
const METRES_PER_DEGREE_LATITUDE = 110_574;
const SQUARE_METRES_PER_HECTARE = 10_000;
/**
 * How far a declared area may exceed its own bounding box before it is read as a unit error.
 * A polygon can never exceed its bounding box, so any factor above 1 is slack for the flat-earth
 * approximation below. A square-metre value mistaken for hectares overshoots by 10,000, so a factor
 * of 10 catches the unit error without rejecting a coarse or simplified outline.
 */
const AREA_UNIT_TOLERANCE = 10;
/**
 * The topology check compares every pair of ring segments exactly. Rings longer than this are
 * refused rather than waved through, because recording an unchecked ring as checked is a false record.
 */
const MAX_RING_POSITIONS = 2_000;
const NORMALIZED_EVENT_CATEGORIES = ["recorded-harvest", "fire", "insect-disease", "other-intervention", "detected-change"] as const;
const LICENCE_IDS = ["ogl-canada-2.0", "ogl-bc-2.0", "ogl-alberta", "ogl-ontario", "cc-by-4.0-quebec", "terms-pending"] as const;

/** Hard stop on schema drift: an undeclared field is named and refused, never silently dropped. */
function rejectUndeclaredFields(candidate: unknown, declared: readonly string[], label: string): void {
  if (!candidate || typeof candidate !== "object") return;
  for (const field of Object.keys(candidate as Record<string, unknown>)) {
    if (!declared.includes(field)) throw new Error(`Ingestion ${label} carries an undeclared field: ${field}.`);
  }
}

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

type Position = readonly [number, number];

function orientation(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function touchesSegment(a: Position, b: Position, point: Position): boolean {
  return orientation(a, b, point) === 0
    && Math.min(a[0], b[0]) <= point[0] && point[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= point[1] && point[1] <= Math.max(a[1], b[1]);
}

function segmentsMeet(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return touchesSegment(p3, p4, p1) || touchesSegment(p3, p4, p2) || touchesSegment(p1, p2, p3) || touchesSegment(p1, p2, p4);
}

/** A closed ring is simple when no two non-adjacent edges meet and adjacent edges meet only at their shared position. */
function rejectSelfIntersection(ring: readonly Position[]): void {
  const edges = ring.length - 1;
  for (let i = 0; i < edges; i += 1) {
    for (let j = i + 1; j < edges; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === edges - 1);
      if (adjacent) continue;
      if (segmentsMeet(ring[i], ring[i + 1], ring[j], ring[j + 1])) throw new Error("Ingestion event geometry ring is self-intersecting.");
    }
  }
}

function validateGeometry(geometry: PolygonGeometry): PolygonGeometry {
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) throw new Error("Ingestion event geometry is corrupt.");
  rejectUndeclaredFields(geometry, POLYGON_GEOMETRY_FIELDS, "event geometry");
  if (geometry.crs !== INGESTION_CRS) throw new Error(`Ingestion event geometry must declare the ${INGESTION_CRS} coordinate reference system.`);
  for (const ring of geometry.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) throw new Error("Ingestion event geometry is corrupt.");
    if (ring.length > MAX_RING_POSITIONS) throw new Error(`Ingestion event geometry ring exceeds the ${MAX_RING_POSITIONS}-position topology check limit.`);
    for (const position of ring) {
      if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) throw new Error("Ingestion event geometry is corrupt.");
      if (Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) throw new Error(`Ingestion event geometry position is outside the ${INGESTION_CRS} range.`);
    }
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) throw new Error("Ingestion event geometry is corrupt.");
    const distinct = new Set(ring.slice(0, -1).map((position) => `${position[0]},${position[1]}`));
    if (distinct.size < 3) throw new Error("Ingestion event geometry ring needs at least three distinct positions.");
    rejectSelfIntersection(ring);
  }
  return geometry;
}

/**
 * Upper bound on the area a geometry could hold, from its bounding box on a local flat approximation.
 * It is deliberately generous. It exists to catch a unit error, not to measure area.
 */
function boundingBoxHectares(geometry: PolygonGeometry): number {
  const positions = geometry.coordinates.flat();
  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  const midLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const width = (Math.max(...longitudes) - Math.min(...longitudes)) * METRES_PER_DEGREE_LONGITUDE * Math.cos((midLatitude * Math.PI) / 180);
  const height = (Math.max(...latitudes) - Math.min(...latitudes)) * METRES_PER_DEGREE_LATITUDE;
  return Math.abs(width * height) / SQUARE_METRES_PER_HECTARE;
}

export function validateSourceContract(candidate: Partial<SourceContract>): SourceContract {
  if (candidate.status !== "example") throw new Error("Ingestion fixtures must be labelled example.");
  rejectUndeclaredFields(candidate, SOURCE_CONTRACT_FIELDS, "source contract");
  const licenceId = candidate.licenceId;
  if (!licenceId || !LICENCE_IDS.includes(licenceId as LicenceId)) throw new Error("Ingestion source requires a registered licence ID.");
  const explanation = candidate.explanation;
  if (!explanation?.en?.trim() || !explanation.fr.trim()) throw new Error("Ingestion source requires English and French explanations.");
  const fieldMapping = candidate.fieldMapping;
  if (!fieldMapping || FIELD_MAPPING_FIELDS.some((field) => !fieldMapping[field]?.trim())) throw new Error("Ingestion source requires a complete field mapping.");
  rejectUndeclaredFields(fieldMapping, FIELD_MAPPING_FIELDS, "source field mapping");
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
  rejectUndeclaredFields(candidate, NORMALIZED_EVENT_FIELDS, "event");
  if (!NORMALIZED_EVENT_CATEGORIES.includes(candidate.category as NormalizedEvent["category"])) throw new Error("Ingestion event category is invalid.");
  if (candidate.evidence !== "official-record" && candidate.evidence !== "satellite-observation" && candidate.evidence !== "derived-estimate") throw new Error("Ingestion event evidence is invalid.");
  const eventDate = isoDate(candidate.eventDate, "eventDate");
  const eventYear = candidate.eventYear;
  if (!Number.isInteger(eventYear) || eventYear !== Number(eventDate.slice(0, 4))) throw new Error("Ingestion event year must match its date.");
  // The window runs from the plan's national baseline start to the source's own retrieval instant.
  // The upper bound is the record's retrievedAt, never the clock, so the same input always decides the same way.
  if (eventYear < BASELINE_FIRST_YEAR) throw new Error(`Ingestion event eventDate precedes the ${BASELINE_FIRST_YEAR} national baseline.`);
  if (Date.parse(`${eventDate}T00:00:00Z`) > Date.parse(source.retrievedAt)) throw new Error("Ingestion event eventDate is later than its source retrievedAt.");
  const geometry = validateGeometry(candidate.geometry as PolygonGeometry);
  const hectares = candidate.hectares;
  if (typeof hectares !== "number" || !Number.isFinite(hectares) || hectares <= 0 || hectares > MAX_HECTARES) throw new Error("Ingestion event hectares are out of range.");
  if (hectares > boundingBoxHectares(geometry) * AREA_UNIT_TOLERANCE) throw new Error("Ingestion event hectares exceed the area its own geometry can hold.");
  const provenance = candidate.provenance;
  if (!provenance || provenance.sourceId !== source.id || provenance.sourceVersion !== source.sourceVersion || provenance.retrievedAt !== source.retrievedAt || provenance.rawChecksumSha256 !== source.rawChecksumSha256) {
    throw new Error("Ingestion event provenance must match its source contract.");
  }
  rejectUndeclaredFields(provenance, EVENT_PROVENANCE_FIELDS, "event provenance");
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
    geometry,
    hectares,
    provenance: { ...provenance },
    confidence: candidate.confidence,
    coverageGrade: candidate.coverageGrade,
  } as NormalizedEvent;
  if (UNKNOWN_ZERO.test(JSON.stringify(result))) throw new Error("Ingestion event cannot publish an Unknown numeric zero.");
  return Object.freeze(result);
}

/**
 * Validates a whole batch from one source and hard-stops on a repeated event id.
 * Within a single source an id is the publisher's own key, so a repeat is a broken extract, not a
 * real second event, and accepting it would double-count area.
 */
export function validateNormalizedEventBatch(candidates: readonly Partial<NormalizedEvent>[], source: SourceContract): readonly NormalizedEvent[] {
  const seen = new Set<string>();
  const events: NormalizedEvent[] = [];
  for (const candidate of candidates) {
    const event = validateNormalizedEvent(candidate, source);
    if (seen.has(event.id)) throw new Error(`Ingestion batch repeats event id ${event.id} within source ${source.id}.`);
    seen.add(event.id);
    events.push(event);
  }
  return Object.freeze(events);
}

/**
 * Reports event ids seen in more than one source. This returns findings and does not throw, because
 * two sources describing the same fire is normal and expected: a provincial register and a federal
 * detection layer can both carry it lawfully. Which record wins is a matching and precedence
 * decision made later with evidence class, not a corruption signal, so refusing the batch here would
 * discard valid evidence. The within-source case above is the opposite and stays a hard stop.
 */
export function findCrossSourceDuplicates(batches: readonly SourceBatch[]): readonly CrossSourceDuplicate[] {
  const sourcesByEventId = new Map<string, string[]>();
  for (const batch of batches) {
    for (const event of batch.events) {
      const sourceIds = sourcesByEventId.get(event.id) ?? [];
      if (!sourceIds.includes(batch.source.id)) sourceIds.push(batch.source.id);
      sourcesByEventId.set(event.id, sourceIds);
    }
  }
  const duplicates: CrossSourceDuplicate[] = [];
  for (const [eventId, sourceIds] of sourcesByEventId) {
    if (sourceIds.length > 1) duplicates.push(Object.freeze({ eventId, sourceIds: Object.freeze([...sourceIds]) }));
  }
  return Object.freeze(duplicates);
}

/** Keeps official evidence even when it has no corresponding detected-change record. */
export function retainOfficialRecordsWithoutDetectedChange(events: readonly NormalizedEvent[], detectedChangeIds: ReadonlySet<string>): readonly NormalizedEvent[] {
  return events.filter((event) => event.evidence === "official-record" && !detectedChangeIds.has(event.id));
}
