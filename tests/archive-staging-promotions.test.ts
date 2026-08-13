import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Explicit TypeScript extension is required for Node's test runner.
import { archiveKeys, fullObjectChecksumMatches, hexDigestFromProviderBase64, snapshotId, validatePromotionHistory, validatePromotionManifest } from "../lib/archive-staging/validate.ts";
import type { ArchivePromotionManifest, CanadianRegionEvidence, FullObjectChecksum, LocalStagingRecord, PromotionState, RemoteArchiveEvidence } from "../lib/archive-staging/types";

/**
 * These are the real recorded promotions, not fixtures. The keys, snapshot ids, and staged digests
 * are derived here from data/staged-acquisitions.json and compared to what data/immutable-promotions.json
 * claims, so a recorded string can never stand in for a value the contract is supposed to derive.
 */

type StagedEntry = Readonly<{
  id: string;
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  byteLength: number;
  sha256: string;
  crc64nvme: string;
  originalFilename: string;
  publisher: string;
  catalogueUrl: string;
  sourceUrl: string;
  licenceId: string;
  licenceUrl: string;
  attribution: string;
  changesNotice: string;
  immutableObjectStorage: false;
  productionEligible: false;
}>;

type PromotionEntry = Readonly<{
  sourceId: string;
  stagedEntryId: string;
  snapshotId: string;
  payloadKey: string;
  manifestKey: string;
  payloadVersionId: string;
  manifestVersionId: string;
  remoteByteLength: number;
  manifestByteLength: number;
  remoteChecksum: FullObjectChecksum;
  providerReported: Readonly<{ checksumAlgorithm: string; checksumType: string; checksumBase64: string; encoding: string }>;
  retentionMode: "compliance";
  retentionUntil: string;
  manifestRetention: string;
  promotionState: PromotionState;
  supersededPayloadKey: string;
}>;

const staging = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8")) as Readonly<{ status: "local-staging"; entries: readonly StagedEntry[] }>;
const promotions = JSON.parse(readFileSync(new URL("../data/immutable-promotions.json", import.meta.url), "utf8")) as Readonly<{ status: string; reviewer: string; reviewedAt: string; bucket: Readonly<{ bucketId: string; region: CanadianRegionEvidence }>; entries: readonly PromotionEntry[] }>;

function stagedFor(entry: PromotionEntry): StagedEntry {
  const staged = staging.entries.find((candidate) => candidate.id === entry.stagedEntryId);
  if (!staged) throw new Error(`No staged acquisition record exists for ${entry.stagedEntryId}.`);
  return staged;
}

function stagingRecord(staged: StagedEntry): LocalStagingRecord {
  return { storageState: staging.status, immutableObjectStorage: staged.immutableObjectStorage, production: staged.productionEligible, sourceId: staged.sourceId, sourceVersion: staged.sourceVersion, retrievedAt: staged.retrievedAt, byteLength: staged.byteLength, sha256: staged.sha256, crc64nvme: staged.crc64nvme, originalFilename: staged.originalFilename, publisher: staged.publisher, catalogueUrl: staged.catalogueUrl, requestedUrl: staged.sourceUrl, licenceId: staged.licenceId, licenceUrl: staged.licenceUrl, requiredAttribution: staged.attribution, changesNotice: staged.changesNotice };
}

const recorded = promotions.entries.map((entry) => {
  const staged = stagingRecord(stagedFor(entry));
  const keys = archiveKeys(staged) as Readonly<{ payloadKey: string; manifestKey: string }>;
  const remote: RemoteArchiveEvidence = { bucketId: promotions.bucket.bucketId, region: promotions.bucket.region, payloadVersionId: entry.payloadVersionId, manifestVersionId: entry.manifestVersionId, remoteByteLength: entry.remoteByteLength, remoteChecksum: entry.remoteChecksum, retentionMode: entry.retentionMode, retentionUntil: entry.retentionUntil };
  const manifest: ArchivePromotionManifest = { status: "staging-promotion", snapshotId: snapshotId(staged) as string, staged, payloadKey: keys.payloadKey, manifestKey: keys.manifestKey, promotion: { state: entry.promotionState, reviewer: promotions.reviewer, reviewedAt: promotions.reviewedAt }, remote };
  const tampered = (patch: Partial<RemoteArchiveEvidence>): ArchivePromotionManifest => ({ ...manifest, remote: { ...remote, ...patch } });
  return { entry, staged, stagedCrc64nvme: stagedFor(entry).crc64nvme, keys, manifest, tampered };
});

/** A hex digest of the same algorithm taken from a different staged file, which must never satisfy the link. */
const digestOfAnotherFile = (index: number) => recorded[(index + 1) % recorded.length].stagedCrc64nvme;

test("the three recorded promotions sit at the keys and snapshot ids the contract derives from staging", () => {
  assert.deepEqual(recorded.map(({ entry }) => entry.sourceId), ["qc-historic-wildfire-detailed", "alberta-avi-crown", "nrcan-forest-canopy-cover-2022"]);
  for (const { entry, keys, manifest } of recorded) {
    assert.equal(entry.payloadKey, keys.payloadKey);
    assert.equal(entry.manifestKey, keys.manifestKey);
    assert.equal(entry.snapshotId, manifest.snapshotId);
    assert.equal(entry.promotionState, "remote-verified");
    assert.notEqual(entry.payloadKey, entry.supersededPayloadKey);
  }
});

test("the promotion gate admits all three recorded promotions", () => {
  for (const { manifest } of recorded) assert.equal(validatePromotionManifest(manifest), manifest);
  const manifests = recorded.map(({ manifest }) => manifest);
  assert.deepEqual(validatePromotionHistory(manifests), manifests);
  assert.equal(promotions.status, "remote-verified");
});

test("the recorded byte length, retention, and sidecar evidence are the ones the gate reads", () => {
  for (const { entry, staged } of recorded) {
    assert.equal(entry.remoteByteLength, staged.byteLength);
    assert.equal(entry.retentionMode, "compliance");
    assert.equal(entry.retentionUntil, "2033-08-12T00:00:00Z");
    assert.ok(new Date(entry.retentionUntil).getTime() > new Date(promotions.reviewedAt).getTime());
    assert.ok(Number.isSafeInteger(entry.manifestByteLength) && entry.manifestByteLength > 0);
    assert.equal(entry.manifestRetention, "not-locked");
    assert.notEqual(entry.payloadVersionId, entry.manifestVersionId);
  }
});

test("each provider base64 checksum normalises to the recorded hex digest and to the staged digest", () => {
  for (const { entry, staged } of recorded) {
    assert.equal(entry.providerReported.encoding, "base64");
    assert.equal(entry.providerReported.checksumAlgorithm, "CRC64NVME");
    assert.equal(entry.providerReported.checksumType, "FULL_OBJECT");
    assert.equal(entry.remoteChecksum.checksumType, "full-object");
    assert.equal(hexDigestFromProviderBase64(entry.providerReported.checksumBase64), entry.remoteChecksum.digest);
    assert.equal(entry.remoteChecksum.digest, staged.crc64nvme);
    assert.notEqual(entry.remoteChecksum.digest, entry.providerReported.checksumBase64);
  }
  assert.equal(hexDigestFromProviderBase64("SUj3qmuucYc="), "4948f7aa6bae7187");
  assert.equal(hexDigestFromProviderBase64("2XrV6elA3HY="), "d97ad5e9e940dc76");
  assert.equal(hexDigestFromProviderBase64("t1VW2xVHjx4="), "b75556db15478f1e");
  assert.throws(() => hexDigestFromProviderBase64("not base64!"), /base64/);
});

test("the gate rejects retention that is not active compliance retention", () => {
  for (const { tampered } of recorded) {
    assert.throws(() => validatePromotionManifest(tampered({ retentionMode: "governance" as unknown as "compliance" })), /compliance retention evidence/);
    assert.throws(() => validatePromotionManifest(tampered({ retentionMode: undefined })), /compliance retention evidence/);
    assert.throws(() => validatePromotionManifest(tampered({ retentionUntil: undefined })), /compliance retention evidence/);
  }
});

test("the gate rejects a blanked or wrong payload version id", () => {
  for (const { entry, tampered } of recorded) {
    assert.throws(() => validatePromotionManifest(tampered({ payloadVersionId: "" })), /provider version IDs/);
    assert.throws(() => validatePromotionManifest(tampered({ payloadVersionId: "   " })), /provider version IDs/);
    assert.throws(() => validatePromotionManifest(tampered({ payloadVersionId: undefined })), /provider version IDs/);
    assert.notEqual(entry.payloadVersionId.trim(), "");
  }
});

test("the gate rejects a blanked or wrong manifest version id", () => {
  for (const { entry, tampered } of recorded) {
    assert.throws(() => validatePromotionManifest(tampered({ manifestVersionId: "" })), /provider version IDs/);
    assert.throws(() => validatePromotionManifest(tampered({ manifestVersionId: "   " })), /provider version IDs/);
    assert.throws(() => validatePromotionManifest(tampered({ manifestVersionId: undefined })), /provider version IDs/);
    assert.notEqual(entry.manifestVersionId.trim(), "");
  }
});

test("the gate rejects a remote byte length that does not match the staged byte length", () => {
  for (const { staged, tampered } of recorded) {
    assert.throws(() => validatePromotionManifest(tampered({ remoteByteLength: staged.byteLength - 1 })), /matching bytes and checksum/);
    assert.throws(() => validatePromotionManifest(tampered({ remoteByteLength: staged.byteLength + 1 })), /matching bytes and checksum/);
    assert.throws(() => validatePromotionManifest(tampered({ remoteByteLength: undefined })), /matching bytes and checksum/);
  }
});

test("the gate rejects a digest left in the provider's base64 encoding", () => {
  for (const { entry, staged, stagedCrc64nvme, tampered } of recorded) {
    const base64 = entry.providerReported.checksumBase64;
    assert.throws(() => validatePromotionManifest(tampered({ remoteChecksum: { ...entry.remoteChecksum, digest: base64 } })), /matching bytes and checksum/);
    assert.equal(fullObjectChecksumMatches({ checksumType: "full-object", algorithm: "crc64nvme", digest: base64 }, staged), false);
    // A hex digest normalised a second time is no longer the staged digest, so an accidental double conversion also fails.
    assert.equal(fullObjectChecksumMatches({ checksumType: "full-object", algorithm: "crc64nvme", digest: hexDigestFromProviderBase64(stagedCrc64nvme) }, staged), false);
  }
});

test("the gate rejects a valid hex digest that belongs to a different file", () => {
  recorded.forEach(({ entry, stagedCrc64nvme, tampered }, index) => {
    const other = digestOfAnotherFile(index);
    assert.notEqual(other, stagedCrc64nvme);
    assert.match(other, /^[a-f\d]{16}$/);
    assert.throws(() => validatePromotionManifest(tampered({ remoteChecksum: { ...entry.remoteChecksum, digest: other } })), /matching bytes and checksum/);
  });
});

test("a superseded flat key is history, not the predecessor of a first promotion", () => {
  for (const { entry, manifest } of recorded) {
    assert.ok(entry.supersededPayloadKey.startsWith("raw/"));
    assert.throws(() => validatePromotionHistory([{ ...manifest, predecessorPayloadKey: entry.supersededPayloadKey }]), /first source snapshot/);
  }
});
