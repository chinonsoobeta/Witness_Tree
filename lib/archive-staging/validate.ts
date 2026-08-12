import type { ArchivePromotionManifest, LocalStagingRecord, RemoteArchiveEvidence } from "./types";

const SHA_256 = /^[a-f\d]{64}$/i;
const SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const FILENAME = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const alias = (value: string) => /(?:^|[._/-])(?:current|latest)(?:$|[._/-])/i.test(value);
const timestamp = (value: string) => UTC.test(value) && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const https = (value: string) => /^https:\/\/\S+$/i.test(value);

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
  if (!safeSegment(record.sourceId) || !safeSegment(record.sourceVersion) || !timestamp(record.retrievedAt) || !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0 || !SHA_256.test(record.sha256) || !FILENAME.test(record.originalFilename) || record.originalFilename.includes("/") || record.originalFilename.includes("\\") || alias(record.originalFilename)) throw new Error("Staging input requires safe lineage, exact byte evidence, checksum, and basename.");
  if (![record.publisher, record.licenceId, record.requiredAttribution, record.changesNotice].every((value) => value.trim())) throw new Error("Staging input requires publisher attribution and a changes notice.");
  if (![record.catalogueUrl, record.requestedUrl, record.licenceUrl].every(https)) throw new Error("Staging input requires HTTPS catalogue, requested, and licence URLs.");
  return record;
}

function validateRemote(remote: RemoteArchiveEvidence, state: ArchivePromotionManifest["promotion"]["state"], staged: LocalStagingRecord) {
  if (!safeSegment(remote.bucketId) || remote.region.countryCode !== "CA" || !safeSegment(remote.region.regionId) || !remote.region.evidenceReference.trim()) throw new Error("Remote evidence requires a named Canadian region and evidence reference.");
  if (state !== "remote-verified") return;
  if (!remote.payloadVersionId?.trim() || !remote.manifestVersionId?.trim() || !Number.isSafeInteger(remote.remoteByteLength) || remote.remoteByteLength !== staged.byteLength || !remote.remoteSha256 || remote.remoteSha256.toLowerCase() !== staged.sha256.toLowerCase() || remote.retentionMode !== "compliance" || !remote.retentionUntil || !timestamp(remote.retentionUntil)) throw new Error("Remote verification requires matching bytes and checksum, provider version IDs, and compliance retention evidence.");
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
