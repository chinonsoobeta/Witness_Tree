import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_OFFICIAL_EVENT, EXAMPLE_SOURCE_CONTRACT }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/fixtures.ts";
import { findCrossSourceDuplicates, retainOfficialRecordsWithoutDetectedChange, validateNormalizedEvent, validateNormalizedEventBatch, validateSourceContract }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/validate.ts";
import { INGESTION_CRS }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/schema.ts";
import type { PolygonGeometry }
from "../lib/ingestion/schema.ts";

const ring = (positions: readonly (readonly [number, number])[]): PolygonGeometry => ({ type: "Polygon", crs: INGESTION_CRS, coordinates: [positions] });

test("validates example source metadata and retains official records without detected change", () => {
  const source = validateSourceContract(EXAMPLE_SOURCE_CONTRACT);
  const event = validateNormalizedEvent(EXAMPLE_OFFICIAL_EVENT, source);
  assert.equal(source.status, "example");
  assert.equal(event.organisationRole, "record publisher");
  assert.deepEqual(retainOfficialRecordsWithoutDetectedChange([event], new Set()), [event]);
  assert.equal(JSON.stringify([source, event]).toLowerCase().includes('"unknown":0'), false);
});

test("rejects missing licence, checksum, locale explanation, corrupt geometry, invalid date/year, and out-of-range hectares", () => {
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, licenceId: undefined }), /licence/i);
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, rawChecksumSha256: "bad" }), /SHA-256/i);
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, explanation: { en: "", fr: "note" } }), /English and French/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { type: "Polygon", crs: INGESTION_CRS, coordinates: [] } }, EXAMPLE_SOURCE_CONTRACT), /geometry/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: ring([[-75, 46], [-75, 46.1], [-74.9, 46.1], [-74.8, 46.2]]) }, EXAMPLE_SOURCE_CONTRACT), /geometry/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "not-a-date" }, EXAMPLE_SOURCE_CONTRACT), /eventDate/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventYear: 2024 }, EXAMPLE_SOURCE_CONTRACT), /year/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, sourceVersion: "other-version" }, EXAMPLE_SOURCE_CONTRACT), /sourceVersion/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, hectares: 100_000_001 }, EXAMPLE_SOURCE_CONTRACT), /hectares/i);
});

test("rejects Unknown numeric zero in fixture payloads", () => {
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, explanation: { en: "Unknown 0", fr: "Note" } }), /Unknown numeric zero/i);
});

test("hard-stops on schema drift and names the undeclared field", () => {
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, extraColumn: "surprise" } as never), /undeclared field: extraColumn/);
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, fieldMapping: { ...EXAMPLE_SOURCE_CONTRACT.fieldMapping, cause: "cause_code" } } as never), /undeclared field: cause/);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, causeCode: 7 } as never, EXAMPLE_SOURCE_CONTRACT), /undeclared field: causeCode/);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, provenance: { ...EXAMPLE_OFFICIAL_EVENT.provenance, batch: "b1" } } as never, EXAMPLE_SOURCE_CONTRACT), /undeclared field: batch/);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { ...EXAMPLE_OFFICIAL_EVENT.geometry, bbox: [0, 0, 1, 1] } } as never, EXAMPLE_SOURCE_CONTRACT), /undeclared field: bbox/);
});

test("requires the declared coordinate reference system and in-range positions", () => {
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { type: "Polygon", coordinates: EXAMPLE_OFFICIAL_EVENT.geometry.coordinates } } as never, EXAMPLE_SOURCE_CONTRACT), /coordinate reference system/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { ...EXAMPLE_OFFICIAL_EVENT.geometry, crs: "EPSG:32198" } } as never, EXAMPLE_SOURCE_CONTRACT), /EPSG:4326/);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: ring([[236000, 5100000], [236000, 5100100], [236100, 5100100], [236000, 5100000]]) }, EXAMPLE_SOURCE_CONTRACT), /outside the EPSG:4326 range/);
});

test("rejects self-intersecting rings and rings with fewer than three distinct positions", () => {
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: ring([[-75, 46], [-74.9, 46.1], [-74.9, 46], [-75, 46.1], [-75, 46]]) }, EXAMPLE_SOURCE_CONTRACT), /self-intersecting/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: ring([[-75, 46], [-75, 46.1], [-75, 46], [-75, 46]]) }, EXAMPLE_SOURCE_CONTRACT), /three distinct positions/i);
});

test("rejects dates outside the baseline window without reading the clock", () => {
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "1983-12-31", eventYear: 1983 }, EXAMPLE_SOURCE_CONTRACT), /precedes the 1984 national baseline/);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "2027-01-01", eventYear: 2027 }, EXAMPLE_SOURCE_CONTRACT), /later than its source retrievedAt/);
  assert.equal(validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "1984-01-01", eventYear: 1984 }, EXAMPLE_SOURCE_CONTRACT).eventYear, 1984);
});

test("rejects an area its own geometry cannot hold", () => {
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, hectares: 855_000 }, EXAMPLE_SOURCE_CONTRACT), /exceed the area its own geometry can hold/);
  assert.equal(validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, hectares: 12.5 }, EXAMPLE_SOURCE_CONTRACT).hectares, 12.5);
});

test("hard-stops on a repeated event id within one source and reports cross-source repeats", () => {
  const source = validateSourceContract(EXAMPLE_SOURCE_CONTRACT);
  const second = { ...EXAMPLE_OFFICIAL_EVENT, id: "example-second-record" };
  assert.equal(validateNormalizedEventBatch([EXAMPLE_OFFICIAL_EVENT, second], source).length, 2);
  assert.throws(() => validateNormalizedEventBatch([EXAMPLE_OFFICIAL_EVENT, { ...EXAMPLE_OFFICIAL_EVENT }], source), /repeats event id example-record-without-change/);
  const otherSource = validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, id: "example-second-source" });
  const otherEvent = validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, provenance: { ...EXAMPLE_OFFICIAL_EVENT.provenance, sourceId: otherSource.id } }, otherSource);
  const duplicates = findCrossSourceDuplicates([{ source, events: [validateNormalizedEvent(EXAMPLE_OFFICIAL_EVENT, source)] }, { source: otherSource, events: [otherEvent] }]);
  assert.deepEqual(duplicates, [{ eventId: "example-record-without-change", sourceIds: ["example-fire-records", "example-second-source"] }]);
  assert.deepEqual(findCrossSourceDuplicates([{ source, events: validateNormalizedEventBatch([EXAMPLE_OFFICIAL_EVENT, second], source) }]), []);
});
