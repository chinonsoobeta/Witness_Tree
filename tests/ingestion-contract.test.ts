import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_OFFICIAL_EVENT, EXAMPLE_SOURCE_CONTRACT }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/fixtures.ts";
import { admitSourceForIngestion, normalizeAdmittedEvent, retainOfficialRecordsWithoutDetectedChange, validateNormalizedEvent, validateSourceContract }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/validate.ts";

test("validates example source metadata and retains official records without detected change", () => {
  const source = validateSourceContract(EXAMPLE_SOURCE_CONTRACT);
  const event = validateNormalizedEvent(EXAMPLE_OFFICIAL_EVENT, source);
  assert.equal(source.status, "example");
  assert.equal(event.organisation?.role, "record publisher");
  assert.deepEqual(retainOfficialRecordsWithoutDetectedChange([event], new Set()), [event]);
  assert.equal(JSON.stringify([source, event]).toLowerCase().includes('"unknown":0'), false);
});

test("rejects missing licence, checksum, locale explanation, corrupt geometry, invalid date/year, and out-of-range hectares", () => {
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, licenceId: undefined }), /licence/i);
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, rawChecksumSha256: "bad" }), /SHA-256/i);
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, explanation: { en: "", fr: "note" } }), /English and French/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { type: "Polygon", coordinates: [] } }, EXAMPLE_SOURCE_CONTRACT), /geometry/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [2, 2]]] } }, EXAMPLE_SOURCE_CONTRACT), /geometry/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "not-a-date" }, EXAMPLE_SOURCE_CONTRACT), /eventDate/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventYear: 2024 }, EXAMPLE_SOURCE_CONTRACT), /year/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, sourceVersion: "other-version" }, EXAMPLE_SOURCE_CONTRACT), /sourceVersion/i);
  assert.throws(() => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, hectares: 100_000_001 }, EXAMPLE_SOURCE_CONTRACT), /hectares/i);
});

test("rejects Unknown numeric zero in fixture payloads", () => {
  assert.throws(() => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, explanation: { en: "Unknown 0", fr: "Note" } }), /Unknown numeric zero/i);
});

test("production ingestion accepts only an admitted complete ledger row", () => {
  const admitted = {
    status: "admissible",
    id: "nrcan-annual-land-cover",
    publisher: "Natural Resources Canada",
    datasetNameOriginal: "Annual high resolution forest land cover for Canada",
    originalLanguage: "en",
    explanation: { en: "Annual national forest land-cover evidence.", fr: "Données annuelles nationales sur la couverture forestière." },
    catalogueUrl: "https://open.canada.ca/data/dataset/example",
    sourceUrl: "https://open.canada.ca/data/dataset/example",
    licenceId: "ogl-canada-2.0",
    licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
    edition: "2022 edition",
    sourceVersion: "2022",
    effectiveDate: "2022-12-31",
    retrievedAt: "2026-08-25T12:00:00Z",
    rawChecksumSha256: "d".repeat(64),
    archiveVersion: "raw/nrcan-annual-land-cover/2022/2026-08-25",
    updateCadence: "annual",
    nextExpectedRefresh: { status: "scheduled", date: "2027-12-31" },
    redistributionTerms: "Open Government Licence – Canada permits redistribution with attribution.",
    bulkRedistributionStatus: "bulk-republication-permitted",
    coverage: { status: "unavailable", reason: { en: "Illustrative admitted record has no digitized coverage geometry.", fr: "Le registre admis illustratif ne comporte aucune géométrie de couverture numérisée." } },
    schemaSummary: "One Byte land-cover raster band with documented class codes.",
    transformations: "No transformation before admission.",
    requiredAttribution: "Contains information licensed under the Open Government Licence – Canada.",
    redistributionStatus: "redistribution-permitted",
    modificationNotice: "Witness Tree has not modified this raw archive.",
    correctionsContact: "https://open.canada.ca/en/contact",
    admissionState: "admitted",
  } as const;
  assert.deepEqual(admitSourceForIngestion(admitted), admitted);
  assert.throws(() => admitSourceForIngestion({ ...admitted, admissionState: "candidate" as never }), /admitted/);
  assert.throws(() => admitSourceForIngestion(EXAMPLE_SOURCE_CONTRACT as never), /admissible/i);

  const productionCandidate = {
    id: "admitted-detected-change",
    category: "detected-change",
    evidence: "satellite-observation",
    eventDate: "2022-08-11",
    eventYear: 2022,
    geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
    hectares: 1,
    confidenceInput: { evidenceClass: "satellite-observation", authoritativeRecord: false, geometryResolved: true, eventDateResolvedToYear: true, requiredAttributesPresent: true },
    coverageGrade: "national-baseline",
  } as const;
  const productionEvent = normalizeAdmittedEvent(productionCandidate, admitted);
  assert.equal(productionEvent.status, "admitted");
  assert.deepEqual(productionEvent.provenance, { sourceId: admitted.id, sourceVersion: admitted.sourceVersion, retrievedAt: admitted.retrievedAt, rawChecksumSha256: admitted.rawChecksumSha256 });
  assert.equal(productionEvent.organisation, undefined);
  assert.equal(productionEvent.confidence.level, "medium");
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, organisation: EXAMPLE_OFFICIAL_EVENT.organisation }, admitted), /official-record/);
  const officialConfidenceInput = { ...productionCandidate.confidenceInput, evidenceClass: "official-record", authoritativeRecord: true } as const;
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, evidence: "official-record", confidenceInput: officialConfidenceInput }, admitted), /event-level official-record citation/);
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, evidence: "official-record", confidenceInput: officialConfidenceInput, organisation: { ...EXAMPLE_OFFICIAL_EVENT.organisation!, recordUrl: "not-a-url" } }, admitted), /Organisation attribution/);
  const officialEvent = normalizeAdmittedEvent({ ...productionCandidate, evidence: "official-record", confidenceInput: officialConfidenceInput, organisation: EXAMPLE_OFFICIAL_EVENT.organisation }, admitted);
  assert.equal(officialEvent.confidence.level, "high");
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, evidence: "official-record", confidenceInput: officialConfidenceInput, organisation: { ...EXAMPLE_OFFICIAL_EVENT.organisation!, recordDate: "2025-02-30" } }, admitted), /organisation recordDate/);
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, confidenceInput: { ...productionCandidate.confidenceInput, evidenceClass: "official-record" } }, admitted), /event evidence class/);
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, coverageGrade: "invented" as never }, admitted), /registered coverage grade/);
  assert.throws(() => normalizeAdmittedEvent({ ...productionCandidate, geometry: { type: "Polygon", coordinates: [[[181, 0], [181, 1], [180, 1], [181, 0]]] } }, admitted), /geometry is corrupt/);
});
