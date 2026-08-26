import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateExampleSourceLedger, validateExampleSourceLedgerEntry }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/data/source-ledger.ts";
import { validateAdmissibleSourceLedgerEntry }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/domain/source-ledger.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../data/source-ledger.json", import.meta.url), "utf8"),
) as Parameters<typeof validateExampleSourceLedger>[0];

test("all source-ledger examples are valid and explicitly illustrative", () => {
  const ledger = validateExampleSourceLedger(fixture);

  assert.equal(ledger.status, "example");
  assert.equal(ledger.entries.length, 3);
  assert.deepEqual(ledger.entries.map((entry) => entry.evidenceClass), [
    "official-record",
    "satellite-observation",
    "derived-estimate",
  ]);
});

test("missing licence, bilingual explanation, checksum, or HTTPS is rejected", () => {
  const entry = fixture.entries?.[0];
  if (!entry) throw new Error("The example fixture requires an entry.");

  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, licenceId: undefined }), /licence/i);
  assert.throws(() => validateExampleSourceLedgerEntry({
    ...entry,
    explanation: { ...entry.explanation, fr: "" },
  }), /English and French/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, rawChecksumSha256: "missing" }), /SHA-256/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, catalogueUrl: "http://example.local/catalogue" }), /HTTPS/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, licenceUrl: "http://example.local/licence" }), /HTTPS/);
});

test("the ledger has no invented Unknown zero", () => {
  const ledger = validateExampleSourceLedger(fixture);
  assert.equal(JSON.stringify(ledger).includes('"Unknown"'), false);
  assert.equal(JSON.stringify(ledger).includes('"unknown"'), false);
  assert.equal(ledger.entries.some((entry) => entry.explanation.en === "0" || entry.explanation.fr === "0"), false);
});

const admittedSource = {
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
  coverage: { status: "geometry", geometry: { type: "Polygon", coordinates: [[[-141, 42], [-52, 42], [-52, 84], [-141, 84], [-141, 42]]] } },
  schemaSummary: "One Byte land-cover raster band with documented class codes.",
  transformations: "No transformation before admission.",
  requiredAttribution: "Contains information licensed under the Open Government Licence – Canada.",
  redistributionStatus: "redistribution-permitted",
  modificationNotice: "Witness Tree has not modified this raw archive.",
  correctionsContact: "https://open.canada.ca/en/contact",
  admissionState: "admitted",
} as const;

test("an admissible source has every Version 2.1 provenance and rights field", () => {
  assert.deepEqual(validateAdmissibleSourceLedgerEntry(admittedSource), admittedSource);
});

test("admissible source validation rejects every missing or unsafe required field", () => {
  const requiredFields = [
    "status", "id", "publisher", "datasetNameOriginal", "originalLanguage", "explanation", "catalogueUrl", "sourceUrl", "licenceId", "licenceUrl", "edition", "sourceVersion", "effectiveDate",
    "retrievedAt", "rawChecksumSha256", "archiveVersion", "updateCadence", "nextExpectedRefresh", "redistributionTerms", "bulkRedistributionStatus", "coverage", "schemaSummary", "transformations",
    "requiredAttribution", "redistributionStatus", "modificationNotice", "correctionsContact", "admissionState",
  ] as const;
  for (const field of requiredFields) {
    assert.throws(
      () => validateAdmissibleSourceLedgerEntry({ ...admittedSource, [field]: undefined }),
      /admissible|required|licence|redistribution/i,
      `missing ${field} must fail closed`,
    );
  }
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, licenceId: "terms-pending" as never }), /exact, resolved licence/i);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, explanation: { en: "English", fr: " " } }), /bilingual explanation/i);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, originalLanguage: "unknown" as never }), /original-language/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, sourceUrl: "http://example.test/source" }), /HTTPS/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, sourceUrl: "https://" }), /HTTPS/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, catalogueUrl: "http://example.test/catalogue" }), /HTTPS/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, licenceUrl: "http://example.test/licence" }), /HTTPS/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, effectiveDate: "2022-99-99" }), /effectiveDate/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, effectiveDate: "2022-02-30" }), /effectiveDate/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, retrievedAt: "not-a-time" }), /retrievedAt/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, retrievedAt: "2026-02-30T12:00:00Z" }), /retrievedAt/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, rawChecksumSha256: "bad" }), /SHA-256/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, redistributionStatus: "not-cleared" as never }), /redistribution-permitted/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, nextExpectedRefresh: { status: "scheduled", date: "2027-02-30" } }), /nextExpectedRefresh/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, nextExpectedRefresh: { status: "unknown", reason: { en: "", fr: "Inconnu" } } }), /bilingual Unknown reason/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, bulkRedistributionStatus: "not-cleared" as never }), /bulk-republication/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, coverage: { status: "unavailable", reason: { en: "", fr: "Indisponible" } } }), /Unavailable coverage/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, coverage: { status: "geometry", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] } } }), /closed/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, admissionState: "candidate" as never }), /admitted admission state/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, correctionsContact: "contact@example.test" }), /corrections contact/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, correctionsContact: "https://" }), /corrections contact/);
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, correctionsContact: "mailto:" }), /corrections contact/);
  assert.deepEqual(validateAdmissibleSourceLedgerEntry({ ...admittedSource, correctionsContact: "mailto:corrections@example.test" }), { ...admittedSource, correctionsContact: "mailto:corrections@example.test" });
  assert.throws(() => validateAdmissibleSourceLedgerEntry({ ...admittedSource, status: "example" as never }), /admissible status/);
});
