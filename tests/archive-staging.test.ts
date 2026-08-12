import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Explicit TypeScript extension is required for Node's test runner.
import { archiveKeys, snapshotId, validateLocalStaging, validatePromotionHistory, validatePromotionManifest } from "../lib/archive-staging/validate.ts";

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
const remote = { bucketId: "witness-tree-raw-ca", region: { countryCode: "CA", regionId: "ca-central-1", evidenceReference: "redacted-provider-config-2026-08-11" }, payloadVersionId: "payload-v1", manifestVersionId: "manifest-v1", remoteByteLength: staged.byteLength, remoteSha256: staged.sha256, retentionMode: "compliance", retentionUntil: "2027-08-11T22:00:00Z" } as const;
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
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, remoteSha256: "b".repeat(64) } }), /matching bytes and checksum/);
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, payloadVersionId: "" } }), /provider version IDs/);
  assert.throws(() => validatePromotionManifest({ ...verified, remote: { ...remote, retentionUntil: "2026-08-11T22:00:00Z" } }), /retention must remain/);
  assert.throws(() => validatePromotionManifest({ ...verified, payloadKey: "raw/current/payload.zip" }), /append-only/);
});

test("history is append-only and makes predecessor semantics explicit", () => {
  const secondStaged = { ...staged, retrievedAt: "2026-08-12T22:00:00Z", sha256: "b".repeat(64) } as const;
  const second = { ...verified, snapshotId: snapshotId(secondStaged), staged: secondStaged, ...archiveKeys(secondStaged), predecessorPayloadKey: keys.payloadKey, promotion: { ...verified.promotion, reviewedAt: "2026-08-12T22:01:00Z" }, remote: { ...remote, remoteSha256: secondStaged.sha256, retentionUntil: "2027-08-12T22:00:00Z" } } as const;
  assert.deepEqual(validatePromotionHistory([verified, second]), [verified, second]);
  assert.throws(() => validatePromotionHistory([verified, { ...second, predecessorPayloadKey: undefined }]), /immediate predecessor/);
  assert.throws(() => validatePromotionHistory([{ ...verified, predecessorPayloadKey: "raw/other/payload/x.zip" }]), /first source snapshot/);
});
