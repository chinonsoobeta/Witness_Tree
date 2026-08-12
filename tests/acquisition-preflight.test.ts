import assert from "node:assert/strict";
import test from "node:test";
import { LARGE_SOURCE_BYTES, preflightSourceAcquisition, type AcquisitionMetadata, type CandidateSource } from "../lib/sources";

const verifiedCandidate: CandidateSource = {
  status: "candidate",
  productionEligible: false,
  licence: { state: "verified", id: "cc-by-4.0", officialUrl: "https://licence.example.ca/cc-by-4" },
  access: { state: "verified", url: "https://data.example.ca/download/source.geojson", formats: ["geojson"] },
};

const smallGeojson: AcquisitionMetadata = {
  expectedByteSize: 1024,
  format: "geojson",
  storageReviewed: false,
  computeReviewed: false,
};

test("ready preflight is still never an ingestion authorization", () => {
  const result = preflightSourceAcquisition(verifiedCandidate, smallGeojson);
  assert.deepEqual(result, { status: "ready", reasons: [], ingestable: false });
});

test("a candidate flag alone cannot make a source ingestable or acquisition-ready", () => {
  const result = preflightSourceAcquisition({ ...verifiedCandidate, licence: { state: "unresolved" } }, smallGeojson);
  assert.equal(result.status, "blocked");
  assert.equal(result.ingestable, false);
  assert.deepEqual(result.reasons, ["verified-licence-required"]);
});

test("requires an exact verified HTTPS access URL, matching format, and positive size", () => {
  const result = preflightSourceAcquisition(
    { ...verifiedCandidate, access: { state: "catalogue-listed" } },
    { ...smallGeojson, expectedByteSize: 0, format: "csv" },
  );
  assert.deepEqual(result.reasons, ["exact-access-url-required", "format-must-match-access", "expected-byte-size-required"]);
});

test("large sources require both storage and compute review before they are ready", () => {
  const blocked = preflightSourceAcquisition(verifiedCandidate, { ...smallGeojson, expectedByteSize: LARGE_SOURCE_BYTES, storageReviewed: true });
  assert.deepEqual(blocked.reasons, ["large-source-compute-review-required"]);
  const ready = preflightSourceAcquisition(verifiedCandidate, { ...smallGeojson, expectedByteSize: LARGE_SOURCE_BYTES, storageReviewed: true, computeReviewed: true });
  assert.equal(ready.status, "ready");
});
