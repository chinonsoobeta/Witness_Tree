import type { ArchivePromotionManifest, CompositeChecksum, FullObjectChecksum, LocalStagingRecord, RemoteArchiveEvidence } from "./types";

const SHA_256 = /^[a-f\d]{64}$/i;
const CRC64NVME = /^[a-f\d]{16}$/i;
const COMPOSITE_DIGEST = /^[A-Za-z\d+/]+={0,2}-\d+$/;
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;
const DIGEST_SHAPE = { sha256: SHA_256, crc64nvme: CRC64NVME } as const;
const SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const FILENAME = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const alias = (value: string) => /(?:^|[._/-])(?:current|latest)(?:$|[._/-])/i.test(value);
const timestamp = (value: string) => UTC.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const https = (value: string) => /^https:\/\/\S+$/i.test(value);

/**
 * Normalises a provider's base64 whole-object digest to the lower-case hex this contract records.
 * Recording is single-encoding on purpose: every whole-object digest in this contract is hex, so an
 * unconverted base64 value fails `fullObjectChecksumMatches` rather than passing it unnoticed.
 */
export function hexDigestFromProviderBase64(value: string) {
  if (!BASE64.test(value) || value.length === 0 || value.length % 4 !== 0) throw new Error("A provider digest must be base64 before it can be normalised to hex.");
  const bytes = atob(value);
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) hex += bytes.charCodeAt(index).toString(16).padStart(2, "0");
  return hex;
}

export function safeSegment(value: string) {
  return SEGMENT.test(value) && !alias(value) && !value.includes("%") && !value.includes("/") && !value.includes("\\");
}

export function archiveKeys(input: Pick<LocalStagingRecord, "sourceId" | "sourceVersion" | "retrievedAt" | "sha256" | "originalFilename">) {
  const retrieved = input.retrievedAt.replace(/:/g, "-");
  const filename = input.originalFilename.toLowerCase();
  const prefix = `raw/${input.sourceId}/${input.sourceVersion}/${retrieved}/${input.sha256.toLowerCase()}`;
  return { payloadKey: `${prefix}/payload/${filename}`, manifestKey: `${prefix}/manifest.json` };
}

export function snapshotId(input: Pick<LocalStagingRecord, "sourceId" | "sourceVersion" | "retrievedAt" | "sha256">) {
  return `${input.sourceId}:${input.sourceVersion}:${input.retrievedAt}:${input.sha256.toLowerCase()}`;
}

export function validateLocalStaging(record: LocalStagingRecord) {
  if (record.storageState !== "local-staging" || record.immutableObjectStorage !== false || record.production !== false) throw new Error("Staging inputs can never claim immutable or production storage.");
  if (record.crc64nvme !== undefined && !CRC64NVME.test(record.crc64nvme)) throw new Error("A staged CRC64NVME must be a 16-character hex digest of the whole file.");
  if (!safeSegment(record.sourceId) || !safeSegment(record.sourceVersion) || !timestamp(record.retrievedAt) || !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0 || !SHA_256.test(record.sha256) || !FILENAME.test(record.originalFilename) || record.originalFilename.includes("/") || record.originalFilename.includes("\\") || alias(record.originalFilename)) throw new Error("Staging input requires safe lineage, exact byte evidence, checksum, and basename.");
  if (![record.publisher, record.licenceId, record.requiredAttribution, record.changesNotice].every((value) => value.trim())) throw new Error("Staging input requires publisher attribution and a changes notice.");
  if (![record.catalogueUrl, record.requestedUrl, record.licenceUrl].every(https)) throw new Error("Staging input requires HTTPS catalogue, requested, and licence URLs.");
  return record;
}

/**
 * A whole-object digest is comparable to the staged digest of the same algorithm at any object size.
 * Both sides must already be hex: a provider's base64 form fails the shape test for its algorithm.
 */
export function fullObjectChecksumMatches(checksum: FullObjectChecksum, staged: Pick<LocalStagingRecord, "sha256" | "crc64nvme">) {
  const expected = checksum.algorithm === "sha256" ? staged.sha256 : staged.crc64nvme;
  const shape = DIGEST_SHAPE[checksum.algorithm];
  return expected !== undefined && shape.test(expected) && shape.test(checksum.digest) && checksum.digest.toLowerCase() === expected.toLowerCase();
}

/**
 * A multipart digest links back to staging only through a local recomputation at the same part size
 * and part count. Absent part metadata leaves the link Unknown, which is never treated as a match.
 */
export function compositeChecksumMatches(remote: CompositeChecksum, local: CompositeChecksum | undefined, byteLength: number) {
  const partSizeBytes = remote.partSizeBytes;
  const partCount = remote.partCount;
  if (partSizeBytes === undefined || partCount === undefined || !Number.isSafeInteger(partSizeBytes) || partSizeBytes <= 0 || !Number.isSafeInteger(partCount) || partCount <= 0) return false;
  if (!local || local.algorithm !== remote.algorithm || local.partSizeBytes !== partSizeBytes || local.partCount !== partCount) return false;
  if (!COMPOSITE_DIGEST.test(remote.digest) || !remote.digest.endsWith(`-${partCount}`) || remote.digest !== local.digest) return false;
  return partSizeBytes * partCount >= byteLength && partSizeBytes * (partCount - 1) < byteLength;
}

function checksumLinked(remote: RemoteArchiveEvidence, staged: LocalStagingRecord) {
  const checksum = remote.remoteChecksum;
  if (!checksum) return false;
  return checksum.checksumType === "full-object" ? fullObjectChecksumMatches(checksum, staged) : compositeChecksumMatches(checksum, remote.locallyRecomputedComposite, staged.byteLength);
}

function validateRemote(remote: RemoteArchiveEvidence, state: ArchivePromotionManifest["promotion"]["state"], staged: LocalStagingRecord) {
  if (!safeSegment(remote.bucketId) || remote.region.countryCode !== "CA" || !safeSegment(remote.region.regionId) || !remote.region.evidenceReference.trim()) throw new Error("Remote evidence requires a named Canadian region and evidence reference.");
  if (state !== "remote-verified") return;
  if (!remote.payloadVersionId?.trim() || !remote.manifestVersionId?.trim() || !Number.isSafeInteger(remote.remoteByteLength) || remote.remoteByteLength !== staged.byteLength || !checksumLinked(remote, staged) || remote.retentionMode !== "compliance" || !remote.retentionUntil || !timestamp(remote.retentionUntil)) throw new Error("Remote verification requires matching bytes and checksum, provider version IDs, and compliance retention evidence.");
}

export function validatePromotionManifest(manifest: ArchivePromotionManifest) {
  if (manifest.status !== "staging-promotion") throw new Error("Archive promotion manifest must use the staging-promotion status.");
  validateLocalStaging(manifest.staged);
  const expected = archiveKeys(manifest.staged);
  if (manifest.snapshotId !== snapshotId(manifest.staged) || manifest.payloadKey !== expected.payloadKey || manifest.manifestKey !== expected.manifestKey || alias(manifest.payloadKey) || alias(manifest.manifestKey)) throw new Error("Promotion requires deterministic append-only payload and sidecar keys.");
  if (manifest.predecessorPayloadKey && (!manifest.predecessorPayloadKey.startsWith("raw/") || alias(manifest.predecessorPayloadKey) || manifest.predecessorPayloadKey === manifest.payloadKey)) throw new Error("Promotion predecessor must be a distinct immutable payload key.");
  if (manifest.promotion.state === "remote-verified") {
    if (!manifest.promotion.reviewer?.trim() || !manifest.promotion.reviewedAt || !timestamp(manifest.promotion.reviewedAt) || !manifest.remote) throw new Error("Remote verification requires reviewer, review time, and remote evidence.");
    validateRemote(manifest.remote, manifest.promotion.state, manifest.staged);
    if (new Date(manifest.remote.retentionUntil!).getTime() <= new Date(manifest.promotion.reviewedAt).getTime()) throw new Error("Remote retention must remain active after verification.");
  } else if (manifest.remote) {
    validateRemote(manifest.remote, manifest.promotion.state, manifest.staged);
  }
  return manifest;
}

/** Validates ordered manifests as an append-only lineage for each source. */
export function validatePromotionHistory(manifests: readonly ArchivePromotionManifest[]) {
  const previousBySource = new Map<string, ArchivePromotionManifest>();
  const payloadKeys = new Set<string>();
  for (const manifest of manifests) {
    validatePromotionManifest(manifest);
    if (payloadKeys.has(manifest.payloadKey)) throw new Error("Promotion payload keys are append-only and unique.");
    const previous = previousBySource.get(manifest.staged.sourceId);
    if (previous && manifest.predecessorPayloadKey !== previous.payloadKey) throw new Error("A superseding source snapshot requires its immediate predecessor payload key.");
    if (!previous && manifest.predecessorPayloadKey) throw new Error("The first source snapshot cannot name a predecessor.");
    payloadKeys.add(manifest.payloadKey);
    previousBySource.set(manifest.staged.sourceId, manifest);
  }
  return manifests;
}
