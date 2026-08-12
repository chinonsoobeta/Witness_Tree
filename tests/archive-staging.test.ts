import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Explicit TypeScript extension is required for Node's test runner.
import { archiveKeys, fullObjectChecksumMatches, snapshotId, validateLocalStaging, validatePromotionHistory, validatePromotionManifest } from "../lib/archive-staging/validate.ts";
import type { CompositeChecksum } from "../lib/archive-staging/types";

const staged = {
  storageState: "local-staging",
  immutableObjectStorage: false,
  production: false,
  sourceId: "quebec-historic-wildfire",
  sourceVersion: "2026-08-11",
  retrievedAt: "2026-08-11T22:00:00Z",
  byteLength: 414244435,
  sha256: "a".repeat(64),
  originalFilename: "FEUX_PROV_GPKG.zip",
  publisher: "Ministère des Ressources naturelles et des Forêts",
  catalogueUrl: "https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=feux-de-foret",
  requestedUrl: "https://example.ca/FEUX_PROV_GPKG.zip",
  licenceId: "cc-by-4.0",
  licenceUrl: "https://www.donneesquebec.ca/licence/#cc-by",
  requiredAttribution: "Source: Ministère des Ressources naturelles et des Forêts.",
  changesNotice: "No transformation has occurred."
} as const;
const keys = archiveKeys(staged);
const remote = { bucketId: "witness-tree-raw-ca", region: { countryCode: "CA", regionId: "ca-central-1", evidenceReference: "redacted-provider-config-2026-08-11" }, payloadVersionId: "payload-v1", manifestVersionId: "manifest-v1", remoteByteLength: staged.byteLength, remoteChecksum: { checksumType: "full-object", algorithm: "sha256", digest: staged.sha256 }, retentionMode: "compliance", retentionUntil: "2027-08-11T22:00:00Z" } as const;
const verified = { status: "staging-promotion", snapshotId: snapshotId(staged), staged, ...keys, promotion: { state: "remote-verified", reviewer: "archive-reviewer", reviewedAt: "2026-08-11T22:01:00Z" }, remote } as const;

test("generates deterministic lower-case append-only payload and sidecar keys", () => {
  assert.deepEqual(keys, { payloadKey: `raw/quebec-historic-wildfire/2026-08-11/2026-08-11T22-00-00Z/${staged.sha256}/payload/feux_prov_gpkg.zip`, manifestKey: `raw/quebec-historic-wildfire/2026-08-11/2026-08-11T22-00-00Z/${staged.sha256}/manifest.json` });
  assert.equal(validatePromotionManifest(verified), verified);
});

test("staging records cannot claim immutable or production storage and require attribution", () => {
  assert.equal(validateLocalStaging(staged), staged);
  assert.throws(() => validateLocalStaging({ ...staged, immutableObjectStorage: true } as unknown as typeof staged), /never claim/);
  assert.throws(() => validateLocalStaging({ ...staged, production: true } as unknown as typeof staged), /never claim/);
  assert.throws(() => validateLocalStaging({ ...staged, requiredAttribution: "" }), /attribution/);
  assert.throws(() => validateLocalStaging({ ...staged, sourceId: "latest" }), /safe lineage/);
});

test("remote verification requires Canadian evidence, exact remote bytes, versions, and active retention", () => {
  assert.throws(() => validatePromotionManifest({ ...verified, remote: ({ ...remote, region: { ...remote.region, countryCode: "US" } } as unknown as typeof remote) }), /Canadian region/);
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, remoteChecksum: { ...remote.remoteChecksum, digest: "b".repeat(64) } } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, payloadVersionId: "" } }), /provider version IDs/);
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, retentionUntil: "2026-08-11T22:00:00Z" } }), /retention must remain/);
  assert.throws(() => validatePromotionManifest({ ...verified, payloadKey: "raw/current/payload.zip" }), /append-only/);
});

const multipartStaged = { ...staged, sourceId: "nrcan-forest-canopy-cover-2022", byteLength: 9954395939, sha256: "c".repeat(64), crc64nvme: "0123456789abcdef", originalFilename: "CA_canopy_cover_2022.zip" } as const;
const multipartComposite = { checksumType: "composite", algorithm: "sha256", digest: "WArNGEIbEUhytUE0YXsBpgAPJvgkwqiW+hBe6SzccDA=-1187", partSizeBytes: 8388608, partCount: 1187 } as const;
const multipartVerified = { status: "staging-promotion", snapshotId: snapshotId(multipartStaged), staged: multipartStaged, ...archiveKeys(multipartStaged), promotion: { state: "remote-verified", reviewer: "archive-reviewer", reviewedAt: "2026-08-11T22:01:00Z" }, remote: { ...remote, remoteByteLength: multipartStaged.byteLength, remoteChecksum: multipartComposite, locallyRecomputedComposite: multipartComposite } } as const;

test("a multipart composite digest without part size or count leaves integrity unknown and is rejected", () => {
  const withoutParts = { checksumType: "composite", algorithm: "sha256", digest: multipartComposite.digest } as const;
  assert.throws(() => validatePromotionManifest({ ...multipartVerified, remote: { ...multipartVerified.remote, remoteChecksum: withoutParts, locallyRecomputedComposite: withoutParts } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...multipartVerified, remote: { ...multipartVerified.remote, remoteChecksum: { ...multipartComposite, partCount: undefined } } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...multipartVerified, remote: { ...multipartVerified.remote, locallyRecomputedComposite: undefined } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...multipartVerified, remote: { ...multipartVerified.remote, locallyRecomputedComposite: { ...multipartComposite, partSizeBytes: 16777216 } } }), /matching bytes and checksum/);
});

test("a multipart composite matching a local recomputation at the same part size and count is accepted", () => {
  assert.equal(validatePromotionManifest(multipartVerified), multipartVerified);
});

test("a full-object CRC64NVME links a multipart object to staging, and a mismatch is rejected", () => {
  const crcRemote = { ...multipartVerified.remote, remoteChecksum: { checksumType: "full-object", algorithm: "crc64nvme", digest: multipartStaged.crc64nvme }, locallyRecomputedComposite: undefined } as const;
  const crcVerified = { ...multipartVerified, remote: crcRemote } as const;
  assert.equal(validatePromotionManifest(crcVerified), crcVerified);
  assert.throws(() => validatePromotionManifest({ ...crcVerified, remote: { ...crcRemote, remoteChecksum: { ...crcRemote.remoteChecksum, digest: "fedcba9876543210" } } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...crcVerified, staged: { ...multipartStaged, crc64nvme: undefined }, remote: crcRemote }), /matching bytes and checksum/);
});

test("a composite digest can never stand in for a whole-object digest", () => {
  const composite: CompositeChecksum = multipartComposite;
  // @ts-expect-error A composite digest is not a whole-object digest and cannot be compared to one.
  void fullObjectChecksumMatches(composite, multipartStaged);
  assert.equal(fullObjectChecksumMatches({ checksumType: "full-object", algorithm: "crc64nvme", digest: multipartStaged.crc64nvme }, multipartStaged), true);
});

test("history is append-only and makes predecessor semantics explicit", () => {
  const secondStaged = { ...staged, retrievedAt: "2026-08-12T22:00:00Z", sha256: "b".repeat(64) } as const;
  const second = { ...verified, snapshotId: snapshotId(secondStaged), staged: secondStaged, ...archiveKeys(secondStaged), predecessorPayloadKey: keys.payloadKey, promotion: { ...verified.promotion, reviewedAt: "2026-08-12T22:01:00Z" }, remote: { ...remote, remoteChecksum: { ...remote.remoteChecksum, digest: secondStaged.sha256 }, retentionUntil: "2027-08-12T22:00:00Z" } } as const;
  assert.deepEqual(validatePromotionHistory([verified, second]), [verified, second]);
  assert.throws(() => validatePromotionHistory([verified, { ...second, predecessorPayloadKey: undefined }]), /immediate predecessor/);
  assert.throws(() => validatePromotionHistory([{ ...verified, predecessorPayloadKey: "raw/other/payload/x.zip" }]), /first source snapshot/);
});
