import assert from "node:assert/strict";
import test from "node:test";
import { validateStagedAcquisitions } from "../scripts/check-staged-acquisitions.mjs";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { EXAMPLE_OFFICIAL_EVENT, EXAMPLE_SOURCE_CONTRACT } from "../lib/ingestion/fixtures.ts";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { validateNormalizedEvent, validateNormalizedEventBatch, validateSourceContract } from "../lib/ingestion/validate.ts";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { matchDetectedChange } from "../lib/pipeline/matching.ts";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { decideStagedTransformation } from "../lib/transformation/decision.ts";

/**
 * Deliberately corrupt, production-shaped metadata only. Nothing in this corpus points at a
 * publisher, opens an archive, uploads an object, or calls an ingestion path. The valid-looking
 * values make each failure a check of the named boundary rather than a missing-field shortcut.
 */
const STAGED_ARCHIVE = Object.freeze({
  status: "local-staging",
  notice: "Synthetic verification only; not immutable object storage and not a production release.",
  entries: [{
    id: "synthetic-wildfire-2026-08-14",
    sourceId: "synthetic-wildfire",
    datasetTitle: "Synthetic wildfire archive",
    publisher: "Synthetic public-data authority",
    catalogueUrl: "https://catalogue.example.local/synthetic-wildfire",
    sourceUrl: "https://download.example.local/synthetic-wildfire.zip",
    localPath: "../Witness_Tree-data/raw/synthetic-wildfire/2026-08-14/synthetic-wildfire.zip",
    verifiedAt: "2026-08-14T00:00:00Z",
    byteLength: 42,
    sha256: "c".repeat(64),
    zipIntegrity: "passed",
    licenceId: "ogl-canada-2.0",
    temporalCoverage: "2024",
    attributionState: "metadata-verified",
    attribution: "Contains information licensed under the Synthetic Open Licence.",
    licenceUrl: "https://licence.example.local/synthetic-open-licence",
    changesNotice: "Synthetic archive is unchanged.",
    immutableObjectStorage: false,
    productionEligible: false,
  }],
});

const CLEAN_TRANSFORMATION_INPUT = Object.freeze({
  sourceId: "qc-historic-wildfire-detailed" as const,
  rawChecksumSha256: "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815",
  profileDecision: "ready-for-transformation-design" as const,
  attributionState: "metadata-verified" as const,
  invalidGeometryCount: { kind: "known" as const, value: 0 },
});

type Corruption = Readonly<{ id: string; assertRejected: () => void }>;

const CORRUPTIONS: readonly Corruption[] = Object.freeze([
  {
    id: "checksum",
    assertRejected: () => assert.throws(
      () => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, rawChecksumSha256: "not-a-digest" }),
      /SHA-256/,
    ),
  },
  {
    id: "archive-integrity",
    assertRejected: () => assert.throws(
      () => validateStagedAcquisitions({ ...STAGED_ARCHIVE, entries: [{ ...STAGED_ARCHIVE.entries[0], zipIntegrity: "failed" }] }),
      /integrity/i,
    ),
  },
  {
    id: "schema-drift",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, unexpectedPublisherColumn: "surprise" } as never, EXAMPLE_SOURCE_CONTRACT),
      /undeclared field: unexpectedPublisherColumn/,
    ),
  },
  {
    id: "crs",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { ...EXAMPLE_OFFICIAL_EVENT.geometry, crs: "EPSG:32198" } } as never, EXAMPLE_SOURCE_CONTRACT),
      /EPSG:4326/,
    ),
  },
  {
    id: "topology",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, geometry: { type: "Polygon", crs: "EPSG:4326", coordinates: [[[-75, 46], [-74.9, 46.1], [-74.9, 46], [-75, 46.1], [-75, 46]]] } }, EXAMPLE_SOURCE_CONTRACT),
      /self-intersecting/i,
    ),
  },
  {
    id: "unknown-geometry-count",
    assertRejected: () => assert.throws(
      () => decideStagedTransformation({ ...CLEAN_TRANSFORMATION_INPUT, invalidGeometryCount: { kind: "unknown" } }),
      /unknown invalid geometry count/i,
    ),
  },
  {
    id: "date",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, eventDate: "1983-12-31", eventYear: 1983 }, EXAMPLE_SOURCE_CONTRACT),
      /precedes the 1984 national baseline/,
    ),
  },
  {
    id: "area-unit",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, hectares: 855_000 }, EXAMPLE_SOURCE_CONTRACT),
      /exceed the area its own geometry can hold/,
    ),
  },
  {
    id: "event-domain",
    assertRejected: () => assert.throws(
      () => validateNormalizedEvent({ ...EXAMPLE_OFFICIAL_EVENT, category: "clearcut" as never }, EXAMPLE_SOURCE_CONTRACT),
      /category is invalid/,
    ),
  },
  {
    id: "duplicate-id",
    assertRejected: () => assert.throws(
      () => validateNormalizedEventBatch([EXAMPLE_OFFICIAL_EVENT, { ...EXAMPLE_OFFICIAL_EVENT }], EXAMPLE_SOURCE_CONTRACT),
      /repeats event id/,
    ),
  },
  {
    id: "impossible-overlap",
    assertRejected: () => {
      const result = matchDetectedChange(
        { id: "synthetic-change", observationYear: 2024, geometryHectares: 10 },
        [{ id: "synthetic-overlap", eventYear: 2024, geometryHectares: 8, intersectionHectares: 11 }],
      );
      assert.equal(result.selectedMatch, null);
      assert.deepEqual(result.rejectedCandidates.map((candidate) => candidate.reason), ["invalid-geometry"]);
    },
  },
  {
    id: "attribution",
    assertRejected: () => assert.throws(
      () => validateStagedAcquisitions({ ...STAGED_ARCHIVE, entries: [{ ...STAGED_ARCHIVE.entries[0], attribution: "" }] }),
      /attribution is required/i,
    ),
  },
  {
    id: "licence",
    assertRejected: () => assert.throws(
      () => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, licenceId: "made-up-licence" as never }),
      /registered licence ID/i,
    ),
  },
  {
    id: "unknown-as-zero",
    assertRejected: () => assert.throws(
      () => validateSourceContract({ ...EXAMPLE_SOURCE_CONTRACT, explanation: { en: "Unknown: 0", fr: "Inconnu" } }),
      /Unknown numeric zero/i,
    ),
  },
]);

test("Phase 1 corruption corpus is synthetic and each applicable §15.1 gate fails closed", () => {
  assert.equal(validateStagedAcquisitions(STAGED_ARCHIVE), STAGED_ARCHIVE);
  assert.equal(validateSourceContract(EXAMPLE_SOURCE_CONTRACT).status, "example");
  for (const corruption of CORRUPTIONS) {
    assert.doesNotThrow(corruption.assertRejected, `The ${corruption.id} corruption was admitted.`);
  }
  assert.deepEqual(CORRUPTIONS.map(({ id }) => id), [
    "checksum", "archive-integrity", "schema-drift", "crs", "topology", "unknown-geometry-count",
    "date", "area-unit", "event-domain", "duplicate-id", "impossible-overlap", "attribution", "licence", "unknown-as-zero",
  ]);
});
