import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_OFFICIAL_EVENT, EXAMPLE_SOURCE_CONTRACT }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/fixtures.ts";
import { retainOfficialRecordsWithoutDetectedChange, validateNormalizedEvent, validateSourceContract }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/ingestion/validate.ts";

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
