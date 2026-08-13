import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_LOCAL_ADMISSION, EXAMPLE_RECORDED_STAGING } from "../lib/archive-staging/admission-fixtures";
import { recordedStagingRecord, validateLocalAdmission } from "../lib/archive-staging/admission";

test("admits a production-shaped candidate only as a local, non-ingested staging candidate", () => {
  assert.equal(validateLocalAdmission(EXAMPLE_LOCAL_ADMISSION, EXAMPLE_RECORDED_STAGING), EXAMPLE_LOCAL_ADMISSION);
  assert.equal(recordedStagingRecord(EXAMPLE_RECORDED_STAGING).production, false);
});

const corruptions: ReadonlyArray<readonly [string, () => unknown, RegExp]> = [
  ["checksum mismatch", () => ({ ...EXAMPLE_LOCAL_ADMISSION, input: { ...EXAMPLE_LOCAL_ADMISSION.input, sha256: "a".repeat(64) } }), /checksum.*source.*version.*retrieval.*byte length.*path/i],
  ["source version mismatch", () => ({ ...EXAMPLE_LOCAL_ADMISSION, sourceVersion: "2026-08-12" }), /checksum.*source.*version.*retrieval/i],
  ["retrieval mismatch", () => ({ ...EXAMPLE_LOCAL_ADMISSION, retrievedAt: "2026-08-13T05:22:16Z" }), /source version.*retrieval/i],
  ["unsafe path", () => ({ ...EXAMPLE_LOCAL_ADMISSION, input: { ...EXAMPLE_LOCAL_ADMISSION.input, localPath: "../Witness_Tree-data/raw/latest/a.zip" } }), /safe, pinned staging path/i],
  ["production claim", () => ({ ...EXAMPLE_LOCAL_ADMISSION, release: { ...EXAMPLE_LOCAL_ADMISSION.release, production: true } }), /never claim/i],
  ["ingestion claim", () => ({ ...EXAMPLE_LOCAL_ADMISSION, release: { ...EXAMPLE_LOCAL_ADMISSION.release, ingested: true } }), /never claim/i],
  ["missing attribution", () => ({ ...EXAMPLE_RECORDED_STAGING, requiredAttribution: "" }), /attribution/i],
  ["missing licence URL", () => ({ ...EXAMPLE_RECORDED_STAGING, licenceUrl: "" }), /licence URLs/i],
  ["malformed count", () => ({ ...EXAMPLE_LOCAL_ADMISSION, geometryEvidence: [{ ...EXAMPLE_LOCAL_ADMISSION.geometryEvidence[0], featureCount: -1 }] }), /featureCount/i],
  ["unreconciled geometry count", () => ({ ...EXAMPLE_LOCAL_ADMISSION, geometryEvidence: [{ ...EXAMPLE_LOCAL_ADMISSION.geometryEvidence[0], invalidGeometryCount: 1 }] }), /reconcile/i],
  ["unknown as zero", () => ({ ...EXAMPLE_LOCAL_ADMISSION, note: "Unknown: 0" }), /Unknown as zero/i],
];

for (const [name, corrupt, expected] of corruptions) {
  test(`rejects deterministic corruption: ${name}`, () => {
    const value = corrupt();
    if ("requiredAttribution" in (value as object)) assert.throws(() => validateLocalAdmission(EXAMPLE_LOCAL_ADMISSION, value as typeof EXAMPLE_RECORDED_STAGING), expected);
    else assert.throws(() => validateLocalAdmission(value as typeof EXAMPLE_LOCAL_ADMISSION, EXAMPLE_RECORDED_STAGING), expected);
  });
}
